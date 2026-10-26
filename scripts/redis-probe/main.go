// Read-only TLS probe. Credentials arrive through stdin, never command arguments.
package main

import (
	"bufio"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"os"
	"strconv"
	"strings"
	"time"
)

type config struct{ Address, Username, Password, CAFile string }
type redisError string

func (e redisError) Error() string { return string(e) }

func readReply(r *bufio.Reader) (any, error) {
	line, err := r.ReadString('\n')
	if err != nil {
		return nil, err
	}
	if len(line) < 3 || len(line) > 16384 || !strings.HasSuffix(line, "\r\n") {
		return nil, errors.New("invalid Redis reply")
	}
	body := line[1 : len(line)-2]
	switch line[0] {
	case '+', ':':
		return body, nil
	case '-':
		return nil, redisError(body)
	case '$', '*':
		n, err := strconv.Atoi(body)
		if err != nil || n < -1 || n > 65536 {
			return nil, errors.New("invalid Redis reply length")
		}
		if n == -1 {
			return nil, nil
		}
		if line[0] == '$' {
			data := make([]byte, n+2)
			if _, err := io.ReadFull(r, data); err != nil {
				return nil, err
			}
			if string(data[n:]) != "\r\n" {
				return nil, errors.New("invalid Redis bulk reply")
			}
			return string(data[:n]), nil
		}
		if n > 128 {
			return nil, errors.New("oversized Redis array")
		}
		values := make([]any, n)
		for i := range values {
			values[i], err = readReply(r)
			if err != nil {
				return nil, err
			}
		}
		return values, nil
	default:
		return nil, errors.New("unsupported Redis reply")
	}
}

func command(conn net.Conn, reader *bufio.Reader, args ...string) (any, error) {
	if err := conn.SetDeadline(time.Now().Add(8 * time.Second)); err != nil {
		return nil, err
	}
	var request strings.Builder
	fmt.Fprintf(&request, "*%d\r\n", len(args))
	for _, arg := range args {
		fmt.Fprintf(&request, "$%d\r\n%s\r\n", len(arg), arg)
	}
	if _, err := io.WriteString(conn, request.String()); err != nil {
		return nil, err
	}
	return readReply(reader)
}

func run(preflight, connectionOnly bool) error {
	var cfg config
	if err := json.NewDecoder(io.LimitReader(os.Stdin, 1<<20)).Decode(&cfg); err != nil {
		return errors.New("invalid private input")
	}
	host, _, err := net.SplitHostPort(cfg.Address)
	if err != nil {
		return errors.New("invalid server address")
	}
	data, err := os.ReadFile(cfg.CAFile)
	if err != nil {
		return errors.New("cannot read CA certificate")
	}
	block, _ := pem.Decode(data)
	if block == nil || block.Type != "CERTIFICATE" {
		return errors.New("invalid CA certificate file")
	}
	ca, err := x509.ParseCertificate(block.Bytes)
	if err != nil || !ca.IsCA {
		return errors.New("certificate is not a CA")
	}
	fmt.Printf("CA SHA-256: %x\n", sha256.Sum256(ca.Raw))
	roots := x509.NewCertPool()
	if !roots.AppendCertsFromPEM(data) {
		return errors.New("no CA certificate loaded")
	}
	conn, err := tls.DialWithDialer(&net.Dialer{Timeout: 8 * time.Second}, "tcp", cfg.Address, &tls.Config{RootCAs: roots, ServerName: host, MinVersion: tls.VersionTLS12})
	if err != nil {
		var invalid x509.HostnameError
		if errors.As(err, &invalid) {
			return errors.New("TLS certificate does not match the server address; hostname verification was NOT disabled")
		}
		return errors.New("TLS connection failed (network, certificate trust or expiry); verification was NOT disabled")
	}
	defer conn.Close()
	fmt.Println("PASS TLS: CA trust and server identity verified")
	if preflight {
		return nil
	}
	reader := bufio.NewReaderSize(conn, 65536)
	if cfg.Password == "" {
		return errors.New("password is required for authenticated checks")
	}
	if cfg.Username == "" {
		cfg.Username = "default"
	}
	if _, err := command(conn, reader, "AUTH", cfg.Username, cfg.Password); err != nil {
		return errors.New("authentication failed or timed out; credentials were not logged")
	}
	cfg.Password = ""
	if reply, err := command(conn, reader, "PING"); err != nil || reply != "PONG" {
		return errors.New("authenticated PING failed")
	}
	fmt.Println("PASS authenticated PING")
	if connectionOnly {
		fmt.Println("Connection check complete. No keys or settings were changed. Cache memory/eviction policy and application operations remain unverified.")
		return nil
	}
	complete, policyOK, aof := true, false, false
	for _, key := range []string{"maxmemory-policy", "maxmemory", "appendonly", "appendfsync", "save"} {
		reply, err := command(conn, reader, "CONFIG", "GET", key)
		if err != nil {
			complete = false
			var response redisError
			if errors.As(err, &response) {
				fmt.Printf("UNVERIFIED %s: server rejected this CONFIG GET\n", key)
			} else {
				fmt.Printf("UNVERIFIED %s: read failed\n", key)
			}
			continue
		}
		values, ok := reply.([]any)
		if !ok || len(values) != 2 || values[0] != key {
			complete = false
			fmt.Printf("UNVERIFIED %s: unexpected reply\n", key)
			continue
		}
		value, ok := values[1].(string)
		if !ok {
			complete = false
			continue
		}
		fmt.Printf("%s = %q\n", key, value)
		if key == "maxmemory-policy" {
			policyOK = value == "noeviction"
		}
		if key == "appendonly" {
			aof = value == "yes"
		}
	}
	reply, err := command(conn, reader, "INFO", "persistence")
	if text, ok := reply.(string); err == nil && ok {
		for _, line := range strings.Split(text, "\r\n") {
			key, _, _ := strings.Cut(line, ":")
			switch key {
			case "loading", "aof_enabled", "aof_last_write_status", "aof_last_bgrewrite_status", "rdb_last_bgsave_status":
				fmt.Println(line)
			}
		}
	} else {
		complete = false
		fmt.Println("UNVERIFIED persistence INFO: unavailable")
	}
	fmt.Println("No keys or configuration were changed. Restart durability and backup restore are not tested.")
	if !complete {
		return errors.New("some settings remain unverified; keep the authentication API stopped")
	}
	if !policyOK {
		return errors.New("authentication requires maxmemory-policy=noeviction")
	}
	if !aof {
		return errors.New("AOF persistence is not enabled; durability needs provider configuration/review")
	}
	fmt.Println("PASS noeviction and AOF enabled; review reported limits/status before proceeding")
	return nil
}

func main() {
	preflight := flag.Bool("tls-only", false, "verify TLS without authentication")
	connectionOnly := flag.Bool("connection-only", false, "verify TLS, authentication and PING only")
	flag.Parse()
	if err := run(*preflight, *connectionOnly); err != nil {
		fmt.Println("CHECK:", err)
		os.Exit(1)
	}
}

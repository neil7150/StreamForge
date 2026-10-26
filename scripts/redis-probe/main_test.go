package main

import (
	"bufio"
	"io"
	"net"
	"reflect"
	"strings"
	"testing"
)

func TestConfigurationRepliesAndMalformedLengths(t *testing.T) {
	value, err := readReply(bufio.NewReader(strings.NewReader("*2\r\n$16\r\nmaxmemory-policy\r\n$10\r\nnoeviction\r\n")))
	if err != nil || !reflect.DeepEqual(value, []any{"maxmemory-policy", "noeviction"}) {
		t.Fatalf("configuration reply: %v %v", value, err)
	}
	for _, reply := range []string{"$65537\r\n", "*-2\r\n", "*129\r\n", "$3\r\nabcXX", "missing-prefix\r\n", "-NOPERM command blocked\r\n"} {
		if _, err := readReply(bufio.NewReader(strings.NewReader(reply))); err == nil {
			t.Fatal("invalid/denied reply was accepted")
		}
	}
}

func TestPasswordIsEncodedAsOneBulkArgument(t *testing.T) {
	client, server := net.Pipe()
	defer client.Close()
	defer server.Close()
	password := "private\r\nCONFIG SET x y"
	finished := make(chan error, 1)
	go func() {
		request, err := readReply(bufio.NewReader(server))
		if err != nil {
			finished <- err
			return
		}
		if !reflect.DeepEqual(request, []any{"AUTH", "botkeep", password}) {
			finished <- io.ErrUnexpectedEOF
			return
		}
		_, err = io.WriteString(server, "+OK\r\n")
		finished <- err
	}()
	if reply, err := command(client, bufio.NewReader(client), "AUTH", "botkeep", password); err != nil || reply != "OK" {
		t.Fatal("AUTH protocol failed")
	}
	if err := <-finished; err != nil {
		t.Fatal("password did not remain a single protocol argument")
	}
}

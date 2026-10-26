package backendtests

import (
	"strings"

	"github.com/alicebob/miniredis/v2"
	"github.com/alicebob/miniredis/v2/server"
)

// Faults exist only in the disposable test gateway, never the production API.
func setRedisFault(mini *miniredis.Miniredis, mode string) {
	mini.SetError("")
	mini.Server().SetPreHook(func(peer *server.Peer, command string, args ...string) bool {
		command = strings.ToUpper(command)
		if mode == "down" {
			peer.WriteError("ERR integration fault")
			return true
		}
		if mode == "oom" && (command == "SET" || command == "SADD") {
			peer.WriteError("OOM command not allowed when used memory > maxmemory")
			return true
		}
		if mode == "revoke-error" && command == "DEL" {
			peer.WriteError("ERR revocation failure")
			return true
		}
		return false
	})
}

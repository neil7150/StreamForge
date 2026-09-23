// Package mailer provides email sending capabilities for authentication workflows.
package mailer

import (
	"fmt"
	"net/smtp"
	"strings"

	"github.com/rs/zerolog"
)

// Config holds configuration for the SMTP client.
type Config struct {
	Host     string
	Port     int
	User     string
	Pass     string
	From     string
	AppEnv   string
}

// Mailer provides methods to send transactional authentication emails.
type Mailer struct {
	cfg Config
	log zerolog.Logger
}

// NewMailer creates a new Mailer instance.
func NewMailer(cfg Config, log zerolog.Logger) *Mailer {
	return &Mailer{
		cfg: cfg,
		log: log.With().Str("component", "mailer").Logger(),
	}
}

// SendVerificationEmail sends an email containing the verification link or token.
func (m *Mailer) SendVerificationEmail(to, token string) error {
	subject := "Verify your StreamForge Account"
	body := fmt.Sprintf(`Hello,

Thank you for registering on StreamForge!

Your email verification code is: %s

If you did not create an account, you can safely ignore this email.

Best regards,
The StreamForge Team
`, token)

	return m.sendEmail(to, subject, body)
}

// sendEmail handles dispatching either via SMTP or logger fallback.
func (m *Mailer) sendEmail(to, subject, body string) error {
	if m.cfg.Host == "" {
		m.log.Info().
			Str("to", to).
			Str("subject", subject).
			Str("body", body).
			Msg("[DEV EMAIL] SMTP not configured; logged transactional email")
		return nil
	}

	addr := fmt.Sprintf("%s:%d", m.cfg.Host, m.cfg.Port)
	var auth smtp.Auth
	if m.cfg.User != "" && m.cfg.Pass != "" {
		auth = smtp.PlainAuth("", m.cfg.User, m.cfg.Pass, m.cfg.Host)
	}

	from := m.cfg.From
	if from == "" {
		from = "noreply@streamforge.local"
	}

	msg := []byte(strings.Join([]string{
		fmt.Sprintf("From: %s", from),
		fmt.Sprintf("To: %s", to),
		fmt.Sprintf("Subject: %s", subject),
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=UTF-8",
		"",
		body,
	}, "\r\n"))

	if err := smtp.SendMail(addr, auth, from, []string{to}, msg); err != nil {
		m.log.Error().Err(err).Str("to", to).Msg("failed to send SMTP email")
		return fmt.Errorf("send email via smtp: %w", err)
	}

	m.log.Info().Str("to", to).Str("subject", subject).Msg("sent transactional email via SMTP")
	return nil
}

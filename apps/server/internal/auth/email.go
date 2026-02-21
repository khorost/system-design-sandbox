package auth

import (
	"bytes"
	"crypto/rand"
	"crypto/tls"
	_ "embed"
	"fmt"
	"html/template"
	"log/slog"
	"net/smtp"
	"strings"
	"time"

	"github.com/system-design-sandbox/server/internal/config"
)

//go:embed assets/login_email.html
var loginEmailHTML string

var loginEmailTmpl = template.Must(template.New("login_email").Parse(loginEmailHTML))

// EmailSender sends login emails.
type EmailSender interface {
	SendLoginEmail(to, token, code, publicURL string) error
}

// NewEmailSender returns an SMTP sender if configured, otherwise a console fallback.
func NewEmailSender(cfg config.SMTPConfig) EmailSender {
	if cfg.Host == "" {
		slog.Info("email: SMTP_HOST not set, using console fallback")
		return &consoleSender{}
	}
	return &smtpSender{cfg: cfg}
}

// --- Console sender (fallback) ---

type consoleSender struct{}

func (s *consoleSender) SendLoginEmail(to, token, code, publicURL string) error {
	link := publicURL + "/auth/verify?token=" + token
	slog.Debug("login email (console)",
		"to", to,
		"code", code,
		"link", link,
	)
	return nil
}

// --- SMTP sender ---

type smtpSender struct {
	cfg config.SMTPConfig
}

func (s *smtpSender) SendLoginEmail(to, token, code, publicURL string) error {
	link := publicURL + "/auth/verify?token=" + token

	subject := "System Design Sandbox - Login Code: " + code
	body := buildEmailHTML(code, link)
	messageID := generateMessageID(s.cfg.From)

	msg := "From: " + s.cfg.From + "\r\n" +
		"To: " + to + "\r\n" +
		"Subject: " + subject + "\r\n" +
		"Message-ID: " + messageID + "\r\n" +
		"Date: " + time.Now().UTC().Format(time.RFC1123Z) + "\r\n" +
		"MIME-Version: 1.0\r\n" +
		"Content-Type: text/html; charset=UTF-8\r\n" +
		"\r\n" + body

	addr := fmt.Sprintf("%s:%d", s.cfg.Host, s.cfg.Port)

	slog.Debug("sending login email", "to", to, "message_id", messageID)

	var err error
	switch strings.ToLower(s.cfg.TLS) {
	case "tls":
		err = s.sendTLS(addr, to, msg)
	case "starttls":
		err = s.sendSTARTTLS(addr, to, msg)
	default:
		err = s.sendPlain(addr, to, msg)
	}

	if err != nil {
		slog.Error("email send failed", "to", to, "error", err)
	} else {
		slog.Debug("email sent", "to", to, "message_id", messageID)
	}
	return err
}

// generateMessageID creates an RFC 2822 compliant Message-ID using the sender domain.
func generateMessageID(from string) string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	domain := "localhost"
	if parts := strings.SplitN(from, "@", 2); len(parts) == 2 {
		domain = parts[1]
	}
	return fmt.Sprintf("<%x.%x@%s>", b[:8], b[8:], domain)
}

func (s *smtpSender) auth() smtp.Auth {
	if s.cfg.User == "" {
		return nil
	}
	return smtp.PlainAuth("", s.cfg.User, s.cfg.Password, s.cfg.Host)
}

func (s *smtpSender) sendPlain(addr, to, msg string) error {
	return smtp.SendMail(addr, s.auth(), s.cfg.From, []string{to}, []byte(msg))
}

func (s *smtpSender) sendSTARTTLS(addr, to, msg string) error {
	c, err := smtp.Dial(addr)
	if err != nil {
		return fmt.Errorf("smtp dial: %w", err)
	}
	defer c.Close()

	tlsCfg := &tls.Config{ServerName: s.cfg.Host}
	if err := c.StartTLS(tlsCfg); err != nil {
		return fmt.Errorf("smtp starttls: %w", err)
	}
	if a := s.auth(); a != nil {
		if err := c.Auth(a); err != nil {
			return fmt.Errorf("smtp auth: %w", err)
		}
	}
	return s.sendViaClient(c, to, msg)
}

func (s *smtpSender) sendTLS(addr, to, msg string) error {
	tlsCfg := &tls.Config{ServerName: s.cfg.Host}
	conn, err := tls.Dial("tcp", addr, tlsCfg)
	if err != nil {
		return fmt.Errorf("tls dial: %w", err)
	}
	c, err := smtp.NewClient(conn, s.cfg.Host)
	if err != nil {
		conn.Close()
		return fmt.Errorf("smtp new client: %w", err)
	}
	defer c.Close()

	if a := s.auth(); a != nil {
		if err := c.Auth(a); err != nil {
			return fmt.Errorf("smtp auth: %w", err)
		}
	}
	return s.sendViaClient(c, to, msg)
}

func (s *smtpSender) sendViaClient(c *smtp.Client, to, msg string) error {
	if err := c.Mail(s.cfg.From); err != nil {
		return err
	}
	if err := c.Rcpt(to); err != nil {
		return err
	}
	w, err := c.Data()
	if err != nil {
		return err
	}
	if _, err := w.Write([]byte(msg)); err != nil {
		return err
	}
	if err := w.Close(); err != nil {
		return err
	}
	return c.Quit()
}

type emailData struct {
	Code      string
	Link      string
	ExpiresAt string
}

func buildEmailHTML(code, link string) string {
	expiresAt := time.Now().UTC().Add(authTokenTTL).Format("15:04 UTC")
	var buf bytes.Buffer
	if err := loginEmailTmpl.Execute(&buf, emailData{Code: code, Link: link, ExpiresAt: expiresAt}); err != nil {
		slog.Error("email: template render failed", "error", err)
		return ""
	}
	return buf.String()
}

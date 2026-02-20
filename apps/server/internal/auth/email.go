package auth

import (
	"crypto/tls"
	"fmt"
	"log/slog"
	"net/smtp"
	"strings"

	"github.com/system-design-sandbox/server/internal/config"
)

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
	slog.Info("login email",
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

	subject := "System Design Sandbox — Login Code: " + code
	body := buildEmailHTML(code, link)

	msg := "From: " + s.cfg.From + "\r\n" +
		"To: " + to + "\r\n" +
		"Subject: " + subject + "\r\n" +
		"MIME-Version: 1.0\r\n" +
		"Content-Type: text/html; charset=UTF-8\r\n" +
		"\r\n" + body

	addr := fmt.Sprintf("%s:%d", s.cfg.Host, s.cfg.Port)

	switch strings.ToLower(s.cfg.TLS) {
	case "tls":
		return s.sendTLS(addr, to, msg)
	case "starttls":
		return s.sendSTARTTLS(addr, to, msg)
	default:
		return s.sendPlain(addr, to, msg)
	}
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

func buildEmailHTML(code, link string) string {
	return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 0;">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:12px;padding:40px;">
<tr><td style="text-align:center;">
  <h1 style="color:#e2e8f0;font-size:20px;margin:0 0 8px;">System Design Sandbox</h1>
  <p style="color:#94a3b8;font-size:14px;margin:0 0 32px;">Your login code</p>
  <div style="background:#0f172a;border-radius:8px;padding:20px;margin:0 0 24px;">
    <span style="color:#60a5fa;font-size:32px;font-weight:bold;letter-spacing:6px;">` + code + `</span>
  </div>
  <p style="color:#94a3b8;font-size:13px;margin:0 0 24px;">Or click the button below:</p>
  <a href="` + link + `" style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:14px;font-weight:600;">
    Verify Email
  </a>
  <p style="color:#64748b;font-size:12px;margin:24px 0 0;">This link expires in 5 minutes.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}

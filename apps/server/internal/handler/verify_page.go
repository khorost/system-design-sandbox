package handler

import (
	"embed"
	"fmt"
	"html"
	"html/template"
	"net/http"
)

//go:embed templates/verify.html
var verifyFS embed.FS

var verifyTmpl = template.Must(template.ParseFS(verifyFS, "templates/verify.html"))

type verifyPageData struct {
	Token     string
	PublicURL string
}

// writeVerifyError returns an HTML fragment for htmx swap when verification fails.
func writeVerifyError(w http.ResponseWriter, publicURL, message string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	safeURL := html.EscapeString(publicURL)
	fmt.Fprintf(w,
		`<p style="color:#f87171;font-size:15px;font-weight:600;margin-bottom:12px;">%s</p>`+
			`<p style="color:#94a3b8;font-size:13px;margin-bottom:20px;">Please request a new link or enter a code manually.</p>`+
			`<div style="display:flex;gap:12px;justify-content:center;">`+
			`<a href="%s" style="display:inline-block;padding:10px 24px;background:#334155;color:#e2e8f0;border-radius:8px;font-size:14px;font-weight:500;text-decoration:none;">Go to homepage</a>`+
			`<a href="%s" style="display:inline-block;padding:10px 24px;background:#3b82f6;color:#fff;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;">Sign in again</a>`+
			`</div>`,
		html.EscapeString(message), safeURL, safeURL)
}

// VerifyPage serves GET /auth/verify?token=... — a standalone HTML page with htmx.
func (h *AuthHandler) VerifyPage(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		http.Error(w, "missing token", http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("Cache-Control", "no-store")

	data := verifyPageData{Token: token, PublicURL: h.Config.PublicURL}
	if err := verifyTmpl.Execute(w, data); err != nil {
		http.Error(w, "template error", http.StatusInternalServerError)
	}
}

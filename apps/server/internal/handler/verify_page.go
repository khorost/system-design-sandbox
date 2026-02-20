package handler

import (
	"embed"
	"html/template"
	"net/http"
)

//go:embed templates/verify.html
var verifyFS embed.FS

var verifyTmpl = template.Must(template.ParseFS(verifyFS, "templates/verify.html"))

type verifyPageData struct {
	Token string
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

	data := verifyPageData{Token: token}
	if err := verifyTmpl.Execute(w, data); err != nil {
		http.Error(w, "template error", http.StatusInternalServerError)
	}
}

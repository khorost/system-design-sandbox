package handler

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/system-design-sandbox/server/internal/auth"
	"github.com/system-design-sandbox/server/internal/config"
	"github.com/system-design-sandbox/server/internal/geoip"
	"github.com/system-design-sandbox/server/internal/storage"
)

func NewRouter(cfg *config.Config, store *storage.Storage, redisAuth *auth.RedisAuth, emailSender auth.EmailSender, geo *geoip.Lookup) *chi.Mux {
	r := chi.NewRouter()

	r.Use(slogRequestLogger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.RequestID)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"https://sdsandbox.ru", "https://beta.sdsandbox.ru", "http://localhost:5173"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	uh := &UserHandler{Store: store}
	ah := &ArchitectureHandler{Store: store}
	sh := &ScenarioHandler{Store: store}
	simh := &SimulationHandler{Store: store}
	authH := &AuthHandler{Store: store, RedisAuth: redisAuth, Email: emailSender, Config: cfg, GeoIP: geo}
	sessH := &SessionHandler{Store: store, RedisAuth: redisAuth, Config: cfg}

	// Verify page (server-rendered HTML with htmx)
	r.Get("/auth/verify", authH.VerifyPage)

	r.Route("/api/v1", func(r chi.Router) {
		// Public auth endpoints (no middleware)
		r.Route("/auth", func(r chi.Router) {
			r.Post("/send-code", authH.SendCode)
			r.Get("/config", authH.AuthConfig)
			r.Post("/verify", authH.Verify)
			r.Post("/verify-code", authH.VerifyCode)
			r.Post("/refresh", authH.Refresh)
		})

		// Protected endpoints
		r.Group(func(r chi.Router) {
			r.Use(RequireAuth(cfg.JWT.Secret))

			r.Post("/auth/logout", authH.Logout)

			r.Route("/auth/sessions", func(r chi.Router) {
				r.Get("/", sessH.ListSessions)
				r.Delete("/{sessionID}", sessH.RevokeSession)
				r.Post("/revoke-others", sessH.RevokeOtherSessions)
			})

			r.Get("/users/me", uh.Me)
			r.Patch("/users/me", uh.UpdateMe)
		})

		// Existing public endpoints
		r.Route("/users", func(r chi.Router) {
			r.Get("/", uh.List)
			r.Post("/", uh.Create)
			r.Get("/{id}", uh.Get)
			r.Get("/{id}/public", uh.GetPublic)
		})

		r.Route("/architectures", func(r chi.Router) {
			r.Post("/", ah.Create)
			r.Get("/{id}", ah.Get)
			r.Put("/{id}", ah.Update)
			r.Delete("/{id}", ah.Delete)
			r.Get("/user/{userID}", ah.ListByUser)
		})

		r.Route("/scenarios", func(r chi.Router) {
			r.Get("/", sh.List)
			r.Get("/{id}", sh.Get)
		})

		r.Route("/simulations", func(r chi.Router) {
			r.Post("/", simh.Create)
			r.Get("/{id}", simh.Get)
			r.Get("/architecture/{architectureID}", simh.ListByArchitecture)
			r.Get("/leaderboard/{scenarioID}", simh.Leaderboard)
		})
	})

	return r
}

// slogRequestLogger is a chi middleware that logs HTTP requests via slog.
func slogRequestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
		next.ServeHTTP(ww, r)
		slog.Info("http",
			"method", r.Method,
			"path", r.URL.Path,
			"status", ww.Status(),
			"bytes", ww.BytesWritten(),
			"duration_ms", time.Since(start).Milliseconds(),
			"ip", r.RemoteAddr,
		)
	})
}

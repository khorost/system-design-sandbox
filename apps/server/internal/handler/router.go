package handler

import (
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/system-design-sandbox/server/internal/storage"
)

func NewRouter(store *storage.Storage) *chi.Mux {
	r := chi.NewRouter()

	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.RequestID)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"https://sdsandbox.ru", "http://localhost:5173"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	uh := &UserHandler{Store: store}
	ah := &ArchitectureHandler{Store: store}
	sh := &ScenarioHandler{Store: store}
	simh := &SimulationHandler{Store: store}

	r.Route("/api/v1", func(r chi.Router) {
		r.Route("/users", func(r chi.Router) {
			r.Get("/", uh.List)
			r.Post("/", uh.Create)
			r.Get("/{id}", uh.Get)
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

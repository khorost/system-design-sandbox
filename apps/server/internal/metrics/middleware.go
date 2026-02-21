package metrics

import "net/http"

// CountRequests returns an HTTP middleware that increments the Collector's
// per-tick request counter for every request.
func CountRequests(c *Collector) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			c.IncrRequests()
			next.ServeHTTP(w, r)
		})
	}
}

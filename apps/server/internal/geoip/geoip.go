package geoip

import (
	"fmt"
	"log/slog"
	"net"

	"github.com/oschwald/maxminddb-golang"
)

// Lookup provides GeoIP lookups from a MaxMind .mmdb file.
type Lookup struct {
	db *maxminddb.Reader
}

type cityRecord struct {
	City struct {
		Names map[string]string `maxminddb:"names"`
	} `maxminddb:"city"`
	Country struct {
		ISOCode string            `maxminddb:"iso_code"`
		Names   map[string]string `maxminddb:"names"`
	} `maxminddb:"country"`
}

// Open opens the MaxMind database and logs its metadata.
// Returns nil (no-op lookup) if path is empty.
func Open(path string) (*Lookup, error) {
	if path == "" {
		slog.Warn("geoip: MAXMIND_GEOLITE2 not set, geo lookups disabled")
		return nil, nil
	}

	db, err := maxminddb.Open(path)
	if err != nil {
		return nil, fmt.Errorf("geoip: failed to open %s: %w", path, err)
	}

	meta := db.Metadata
	slog.Info("geoip: database loaded",
		"path", path,
		"type", meta.DatabaseType,
		"build_epoch", meta.BuildEpoch,
		"node_count", meta.NodeCount,
		"ip_version", meta.IPVersion,
	)

	return &Lookup{db: db}, nil
}

// Close closes the database.
func (l *Lookup) Close() error {
	if l == nil || l.db == nil {
		return nil
	}
	return l.db.Close()
}

// City returns "City, Country" for the given IP address.
// Returns empty string on any error or if lookup is nil.
func (l *Lookup) City(ipStr string) string {
	if l == nil || l.db == nil {
		return ""
	}

	ip := net.ParseIP(ipStr)
	if ip == nil {
		return ""
	}

	var record cityRecord
	if err := l.db.Lookup(ip, &record); err != nil {
		return ""
	}

	city := record.City.Names["en"]
	country := record.Country.Names["en"]

	if city != "" && country != "" {
		return city + ", " + country
	}
	if country != "" {
		return country
	}
	if city != "" {
		return city
	}
	return ""
}

package geoip

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"time"

	pb "github.com/system-design-sandbox/server/internal/geoip/proto"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

type Result struct {
	Formatted   string
	CountryCode string
}

type Client struct {
	grpcConn   *grpc.ClientConn
	grpcClient pb.GeoIPServiceClient
	restURL    string
	httpClient *http.Client
}

func New(grpcAddr, restURL string) (*Client, error) {
	if grpcAddr == "" && restURL == "" {
		slog.Warn("geoip: no GEOIP_GRPC_ADDR or GEOIP_REST_URL set, geo lookups disabled")
		return nil, nil
	}

	c := &Client{
		restURL: restURL,
		httpClient: &http.Client{
			Timeout: 1 * time.Second,
		},
	}

	if grpcAddr != "" {
		conn, err := grpc.NewClient(grpcAddr,
			grpc.WithTransportCredentials(insecure.NewCredentials()),
		)
		if err != nil {
			slog.Warn("geoip: failed to create gRPC client, will use REST only", "addr", grpcAddr, "error", err)
		} else {
			c.grpcConn = conn
			c.grpcClient = pb.NewGeoIPServiceClient(conn)
		}
	}

	c.logDBInfo()
	return c, nil
}

func (c *Client) Close() {
	if c == nil {
		return
	}
	if c.grpcConn != nil {
		_ = c.grpcConn.Close()
	}
}

func (c *Client) Lookup(ctx context.Context, ip string) Result {
	if c == nil {
		return Result{}
	}

	if c.grpcClient != nil {
		r, err := c.lookupGRPC(ctx, ip)
		if err == nil {
			return r
		}
		slog.Debug("geoip: gRPC lookup failed, trying REST", "ip", ip, "error", err)
	}

	if c.restURL != "" {
		r, err := c.lookupREST(ctx, ip)
		if err == nil {
			return r
		}
		slog.Warn("geoip: REST lookup failed", "ip", ip, "error", err)
	}

	return Result{}
}

func (c *Client) lookupGRPC(ctx context.Context, ip string) (Result, error) {
	ctx, cancel := context.WithTimeout(ctx, 500*time.Millisecond)
	defer cancel()

	resp, err := c.grpcClient.Lookup(ctx, &pb.LookupRequest{Ip: ip})
	if err != nil {
		return Result{}, err
	}
	if !resp.Found {
		return Result{}, nil
	}
	return Result{
		Formatted:   resp.Formatted,
		CountryCode: resp.CountryCode,
	}, nil
}

func (c *Client) lookupREST(ctx context.Context, ip string) (Result, error) {
	u := fmt.Sprintf("%s/api/v1/lookup?ip=%s", c.restURL, url.QueryEscape(ip))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return Result{}, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return Result{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return Result{}, fmt.Errorf("geoip REST: status %d", resp.StatusCode)
	}

	var body struct {
		Formatted   string `json:"formatted"`
		CountryCode string `json:"country_code"`
		Found       bool   `json:"found"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return Result{}, err
	}
	if !body.Found {
		return Result{}, nil
	}
	return Result{
		Formatted:   body.Formatted,
		CountryCode: body.CountryCode,
	}, nil
}

func (c *Client) logDBInfo() {
	if c == nil {
		return
	}

	transport := "rest"
	if c.grpcClient != nil && c.restURL != "" {
		transport = "grpc+rest"
	} else if c.grpcClient != nil {
		transport = "grpc"
	}

	if c.grpcClient != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		info, err := c.grpcClient.GetDBInfo(ctx, &pb.DBInfoRequest{})
		if err == nil {
			slog.Info("geoip: connected",
				"transport", transport,
				"db_type", info.DbType,
				"build_date", info.BuildDate,
				"loaded", info.Loaded,
			)
			return
		}
		slog.Debug("geoip: gRPC GetDBInfo failed, trying REST", "error", err)
	}

	if c.restURL != "" {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.restURL+"/api/v1/db-info", nil)
		if err == nil {
			resp, err := c.httpClient.Do(req)
			if err == nil {
				defer resp.Body.Close()
				var info struct {
					DBType    string `json:"db_type"`
					BuildDate string `json:"build_date"`
					Loaded    bool   `json:"loaded"`
				}
				if json.NewDecoder(resp.Body).Decode(&info) == nil {
					slog.Info("geoip: connected",
						"transport", transport,
						"db_type", info.DBType,
						"build_date", info.BuildDate,
						"loaded", info.Loaded,
					)
					return
				}
			}
		}
	}

	slog.Warn("geoip: configured but could not fetch DB info", "transport", transport)
}

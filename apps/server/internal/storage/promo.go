package storage

import (
	"context"
	"fmt"
)

// ValidateAndUsePromo atomically validates and increments the promo code usage.
// Returns nil if the code is valid and was successfully used.
func (s *Storage) ValidateAndUsePromo(ctx context.Context, code string) error {
	tag, err := s.Pool.Exec(ctx,
		`UPDATE promo_codes
		 SET used_count = used_count + 1
		 WHERE code = $1
		   AND (max_uses IS NULL OR used_count < max_uses)
		   AND (expires_at IS NULL OR expires_at > now())`,
		code,
	)
	if err != nil {
		return fmt.Errorf("promo validate: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("invalid or expired promo code")
	}
	return nil
}

package utils

import (
	"regexp"
	"strings"
)

var (
	nonAlphanumericRegex = regexp.MustCompile(`[^a-z0-9]+`)
	multipleHyphensRegex = regexp.MustCompile(`-+`)
)

func Slugify(s string) string {
	s = strings.ToLower(s)
	s = strings.TrimSpace(s)
	s = nonAlphanumericRegex.ReplaceAllString(s, "-")
	s = multipleHyphensRegex.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	return s
}

#!/bin/bash
# Content Storage Simulation v2 for Swimchain
# More realistic model: users sync THEIR lanes, not the whole network

echo "╔══════════════════════════════════════════════════════════════════════════╗"
echo "║              SWIMCHAIN CONTENT STORAGE SIMULATION v2                     ║"
echo "║                   (Realistic Per-Lane Model)                             ║"
echo "╚══════════════════════════════════════════════════════════════════════════╝"
echo ""

# VISION.md says:
# - 500 MB target per user
# - User syncs ~12 lanes
# - Per-lane size: ~30-50 MB (bounded by decay + fracturing)

echo "=== Design Parameters (from VISION.md) ==="
echo ""
echo "  Storage target per user:    500 MB"
echo "  Lanes synced per user:      ~12"
echo "  Per-lane size target:       30-50 MB"
echo "  Initial sync target:        <5 minutes on slow connection"
echo ""

# Content type sizes
TEXT_KB=2
IMAGE_KB=300      # 500KB max, 300KB average after compression
VIDEO_KB=5000     # 5MB max (60s @ 480p)

# Distribution within a lane
# A lane is a community like "rust-lang" or "local-boston"
# Smaller, more focused than global totals

echo "=== Per-Lane Activity Model ==="
echo ""
echo "  Lane: Medium-sized community (e.g., /lane/rust-lang)"
echo "  Active members: ~1000"
echo "  Posts per day: ~200 (0.2 per member)"
echo ""

LANE_MEMBERS=1000
POSTS_PER_DAY=200
DAYS=30

# Content mix
TEXT_PCT=75      # Higher text in focused communities
IMAGE_PCT=22
VIDEO_PCT=3      # Less video in focused communities

echo "  Content mix:"
echo "    Text-only:    ${TEXT_PCT}%"
echo "    With image:   ${IMAGE_PCT}%"
echo "    With video:   ${VIDEO_PCT}%"
echo ""

total_posts=$((POSTS_PER_DAY * DAYS))
text_posts=$((total_posts * TEXT_PCT / 100))
image_posts=$((total_posts * IMAGE_PCT / 100))
video_posts=$((total_posts * VIDEO_PCT / 100))

echo "=== 30-Day Lane Storage (Raw) ==="
echo ""
echo "  Total posts: ${total_posts}"
echo ""

text_mb=$(echo "scale=2; $text_posts * $TEXT_KB / 1024" | bc)
image_mb=$(echo "scale=2; $image_posts * ($TEXT_KB + $IMAGE_KB) / 1024" | bc)
video_mb=$(echo "scale=2; $video_posts * ($TEXT_KB + $VIDEO_KB) / 1024" | bc)

printf "  Text (%d posts × 2KB):        %6.1f MB\n" $text_posts $text_mb
printf "  Images (%d posts × 302KB):    %6.1f MB\n" $image_posts $image_mb
printf "  Video (%d posts × 5002KB):    %6.1f MB\n" $video_posts $video_mb
echo ""

total_raw=$(echo "scale=2; $text_mb + $image_mb + $video_mb" | bc)
printf "  RAW TOTAL:                     %6.1f MB\n" $total_raw
echo ""

echo "=== After Decay ==="
echo ""
echo "  Decay settings:"
echo "    Text/Images: 30-day half-life"
echo "    Video: 7-day half-life (aggressive)"
echo "    Retention with 5% daily engagement: ~52%"
echo ""

# Apply decay
text_retained=$(echo "scale=2; $text_mb * 0.52" | bc)
image_retained=$(echo "scale=2; $image_mb * 0.52" | bc)
# Video has 7-day decay, so much less retained
video_retained=$(echo "scale=2; $video_mb * 7 / 30 * 0.52" | bc)

printf "  Text after decay:              %6.1f MB\n" $text_retained
printf "  Images after decay:            %6.1f MB\n" $image_retained
printf "  Video after decay (7-day):     %6.1f MB\n" $video_retained
echo ""

total_decayed=$(echo "scale=2; $text_retained + $image_retained + $video_retained" | bc)
printf "  TOTAL AFTER DECAY:             %6.1f MB\n" $total_decayed
echo ""

echo "┌────────────────────────────────────────────────────────────────────────┐"
printf "│  SINGLE LANE STORAGE: %.1f MB (target: 30-50 MB)                   │\n" $total_decayed
echo "└────────────────────────────────────────────────────────────────────────┘"
echo ""

# Check against target
if (( $(echo "$total_decayed <= 50" | bc -l) )); then
    echo "  ✅ WITHIN LANE TARGET (30-50 MB)"
else
    echo "  ⚠️  ABOVE LANE TARGET - may need fracturing"
fi
echo ""

echo "=== User Total Storage (12 lanes) ==="
echo ""
user_total=$(echo "scale=2; $total_decayed * 12" | bc)
printf "  12 lanes × %.1f MB = %.1f MB\n" $total_decayed $user_total
echo ""

if (( $(echo "$user_total <= 500" | bc -l) )); then
    echo "  ✅ WITHIN 500 MB USER TARGET"
else
    echo "  ❌ EXCEEDS 500 MB USER TARGET"
fi
echo ""

echo "=== Sync Time Estimate ==="
echo ""
# Slow connection: 1 Mbps = 0.125 MB/s
sync_time_sec=$(echo "scale=0; $user_total / 0.125" | bc)
sync_time_min=$(echo "scale=1; $sync_time_sec / 60" | bc)
printf "  At 1 Mbps (slow):    %.1f minutes\n" $sync_time_min
# Fast connection: 10 Mbps = 1.25 MB/s
fast_sync=$(echo "scale=1; $user_total / 1.25 / 60" | bc)
printf "  At 10 Mbps:          %.1f minutes\n" $fast_sync
echo ""

echo "=== Scaling Analysis ==="
echo ""
echo "  What if the lane is BIGGER? (10K members, 2K posts/day)"
echo ""

big_posts=$((2000 * 30))
big_text=$((big_posts * TEXT_PCT / 100))
big_image=$((big_posts * IMAGE_PCT / 100))
big_video=$((big_posts * VIDEO_PCT / 100))

big_text_mb=$(echo "scale=2; $big_text * $TEXT_KB / 1024" | bc)
big_image_mb=$(echo "scale=2; $big_image * ($TEXT_KB + $IMAGE_KB) / 1024" | bc)
big_video_mb=$(echo "scale=2; $big_video * ($TEXT_KB + $VIDEO_KB) / 1024" | bc)

# Apply decay
big_text_ret=$(echo "scale=2; $big_text_mb * 0.52" | bc)
big_image_ret=$(echo "scale=2; $big_image_mb * 0.52" | bc)
big_video_ret=$(echo "scale=2; $big_video_mb * 7 / 30 * 0.52" | bc)

big_total=$(echo "scale=2; $big_text_ret + $big_image_ret + $big_video_ret" | bc)
printf "  Large lane (60K posts/month): %.1f MB\n" $big_total
echo ""

if (( $(echo "$big_total > 50" | bc -l) )); then
    echo "  → TRIGGERS BINARY FRACTURING"
    echo "  → Lane splits into 2 branches"
    frac_size=$(echo "scale=2; $big_total / 2" | bc)
    printf "  → Each branch: %.1f MB\n" $frac_size
    echo "  → User syncs branch containing their interactions"
fi
echo ""

echo "╔══════════════════════════════════════════════════════════════════════════╗"
echo "║                              SUMMARY                                     ║"
echo "╠══════════════════════════════════════════════════════════════════════════╣"
echo "║                                                                          ║"
printf "║  Per-Lane Storage:     %6.1f MB (target: 30-50 MB)                     ║\n" $total_decayed
printf "║  User Total (12 lanes): %6.1f MB (target: 500 MB)                      ║\n" $user_total
echo "║                                                                          ║"
echo "║  Content breakdown:                                                      ║"
text_pct_storage=$(echo "scale=0; $text_retained * 100 / $total_decayed" | bc)
image_pct_storage=$(echo "scale=0; $image_retained * 100 / $total_decayed" | bc)
video_pct_storage=$(echo "scale=0; $video_retained * 100 / $total_decayed" | bc)
printf "║    Text:    %2d%% of content, %2d%% of storage                            ║\n" $TEXT_PCT $text_pct_storage
printf "║    Images:  %2d%% of content, %2d%% of storage                            ║\n" $IMAGE_PCT $image_pct_storage
printf "║    Video:    %2d%% of content, %2d%% of storage                            ║\n" $VIDEO_PCT $video_pct_storage
echo "║                                                                          ║"
echo "║  Key insight: VIDEO IS EXPENSIVE                                         ║"
echo "║  - 3% of posts but significant storage                                   ║"
echo "║  - 10× PoW cost + 7-day decay keeps it in check                          ║"
echo "║                                                                          ║"
echo "╚══════════════════════════════════════════════════════════════════════════╝"

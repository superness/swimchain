#!/bin/bash
# Content Storage Simulation for Swimchain
# Simulates text + image storage with decay

echo "╔══════════════════════════════════════════════════════════════════════════╗"
echo "║                    SWIMCHAIN CONTENT STORAGE SIMULATION                  ║"
echo "╚══════════════════════════════════════════════════════════════════════════╝"
echo ""

# Content type parameters (from VISION.md)
TEXT_SIZE_KB=2           # ~2KB per text post
IMAGE_SIZE_KB=300        # 300KB average compressed image
VIDEO_SIZE_KB=5000       # 5MB max video (60s @ 480p)

# Tiered content distribution (realistic social media patterns)
TEXT_PERCENT=70          # 70% text-only posts
IMAGE_PERCENT=25         # 25% posts with images
VIDEO_PERCENT=5          # 5% posts with video

# Decay settings
TEXT_DECAY_DAYS=30
IMAGE_DECAY_DAYS=30
VIDEO_DECAY_DAYS=7       # Faster decay for video

# Retention rate with 5% daily engagement
RETENTION_RATE=0.52      # 52% retained after decay period

echo "=== Content Size Parameters ==="
echo "Text post:        ${TEXT_SIZE_KB} KB"
echo "Image (avg):      ${IMAGE_SIZE_KB} KB"
echo "Video (max):      ${VIDEO_SIZE_KB} KB (5MB)"
echo ""
echo "Content mix: ${TEXT_PERCENT}% text, ${IMAGE_PERCENT}% images, ${VIDEO_PERCENT}% video"
echo ""

# Calculate weighted average post size
WEIGHTED_AVG=$(echo "scale=2; ($TEXT_PERCENT * $TEXT_SIZE_KB + $IMAGE_PERCENT * ($TEXT_SIZE_KB + $IMAGE_SIZE_KB) + $VIDEO_PERCENT * ($TEXT_SIZE_KB + $VIDEO_SIZE_KB)) / 100" | bc)
echo "Weighted average post size: ${WEIGHTED_AVG} KB"
echo ""

echo "╔══════════════════════════════════════════════════════════════════════════╗"
echo "║                          STORAGE PROJECTIONS                             ║"
echo "╠════════════╦═════════════╦════════════════╦══════════════════════════════╣"
echo "║   Users    ║  Posts/day  ║  Raw 30-day    ║   After Decay (52% ret)      ║"
echo "╠════════════╬═════════════╬════════════════╬══════════════════════════════╣"

for users in 100 1000 10000; do
    posts_day=$((users * 2))       # 2 posts per user per day average
    raw_30day=$((posts_day * 30))
    raw_storage_mb=$(echo "scale=2; $raw_30day * $WEIGHTED_AVG / 1024" | bc)
    retained=$(echo "scale=0; $raw_30day * $RETENTION_RATE / 1" | bc)
    retained_storage_mb=$(echo "scale=2; $retained * $WEIGHTED_AVG / 1024" | bc)

    printf "║   %6d   ║   %7d   ║  %8.1f MB   ║        %8.1f MB              ║\n" \
        $users $posts_day $raw_storage_mb $retained_storage_mb
done

echo "╚════════════╩═════════════╩════════════════╩══════════════════════════════╝"
echo ""

echo "=== Content Type Breakdown (10K users, 30 days) ==="
total_posts=600000        # 10K users × 2 posts/day × 30 days
text_posts=$((total_posts * TEXT_PERCENT / 100))
image_posts=$((total_posts * IMAGE_PERCENT / 100))
video_posts=$((total_posts * VIDEO_PERCENT / 100))

text_storage=$(echo "scale=2; $text_posts * $TEXT_SIZE_KB / 1024" | bc)
image_storage=$(echo "scale=2; $image_posts * ($TEXT_SIZE_KB + $IMAGE_SIZE_KB) / 1024" | bc)
video_storage=$(echo "scale=2; $video_posts * ($TEXT_SIZE_KB + $VIDEO_SIZE_KB) / 1024" | bc)

echo ""
echo "┌────────────────────────────────────────────────────────────────────────┐"
echo "│                     10K USERS - 30 DAYS - RAW STORAGE                  │"
echo "├────────────────┬──────────────┬───────────────┬────────────────────────┤"
echo "│  Content Type  │    Posts     │   Size Each   │      Total Storage     │"
echo "├────────────────┼──────────────┼───────────────┼────────────────────────┤"
printf "│  Text only     │   %'9d  │     2 KB      │      %8.1f MB        │\n" $text_posts $text_storage
printf "│  With Image    │   %'9d  │   302 KB      │      %8.1f MB        │\n" $image_posts $image_storage
printf "│  With Video    │   %'9d  │  5002 KB      │      %8.1f MB        │\n" $video_posts $video_storage
echo "├────────────────┴──────────────┴───────────────┼────────────────────────┤"
total_raw=$(echo "scale=2; $text_storage + $image_storage + $video_storage" | bc)
total_after_decay=$(echo "scale=2; $total_raw * $RETENTION_RATE" | bc)
printf "│  TOTAL RAW (before decay)                    │     %8.1f MB        │\n" $total_raw
printf "│  AFTER DECAY (52%% retention)                │     %8.1f MB        │\n" $total_after_decay
echo "└────────────────────────────────────────────────┴────────────────────────┘"
echo ""

echo "=== Video Impact Analysis ==="
echo ""
echo "Video is the storage killer:"
echo ""
echo "  Without video (text + images only):"
no_video=$(echo "scale=2; $text_storage + $image_storage" | bc)
printf "    Raw: %.1f MB → After decay: %.1f MB\n" $no_video $(echo "scale=2; $no_video * $RETENTION_RATE" | bc)
echo ""
echo "  With video (5% of posts):"
printf "    Raw: %.1f MB → After decay: %.1f MB\n" $total_raw $total_after_decay
echo ""
video_percent_storage=$(echo "scale=1; $video_storage * 100 / $total_raw" | bc)
echo "  Video is 5% of posts but ${video_percent_storage}% of storage!"
echo ""

echo "=== Per-User Storage (Target: 500 MB) ==="
echo ""
per_user_raw=$(echo "scale=2; $total_raw / 10000" | bc)
per_user_decay=$(echo "scale=2; $total_after_decay / 10000" | bc)
echo "  Per user (raw):          ${per_user_raw} MB"
echo "  Per user (after decay):  ${per_user_decay} MB"
echo ""
echo "  Target budget:           500 MB"
if (( $(echo "$per_user_decay < 500" | bc -l) )); then
    echo "  Status:                  ✅ WITHIN BUDGET"
else
    echo "  Status:                  ❌ OVER BUDGET"
fi
echo ""

echo "=== Mobile Storage Viability (2015 smartphone: 500 MB app budget) ==="
echo ""
echo "  Syncing ~12 lanes (branches):"
per_lane=$(echo "scale=2; $total_after_decay / 50" | bc)  # Assume 50 lanes total
lanes_12=$(echo "scale=2; $per_lane * 12" | bc)
printf "    Per lane (avg): %.1f MB\n" $per_lane
printf "    12 lanes total: %.1f MB\n" $lanes_12
echo ""
if (( $(echo "$lanes_12 < 500" | bc -l) )); then
    echo "  Status: ✅ FITS ON 2015 SMARTPHONE"
else
    echo "  Status: ❌ TOO LARGE FOR MOBILE"
fi
echo ""

echo "=== Key Takeaways ==="
echo ""
echo "  1. TEXT is negligible (~0.8 MB for 420K posts)"
echo "  2. IMAGES are manageable (~44 MB for 150K image posts)"
echo "  3. VIDEO dominates (~146 MB for just 30K video posts)"
echo ""
echo "  The tiered model works:"
echo "  - Text: base PoW, 30-day decay"
echo "  - Images: 2× PoW, 30-day decay"
echo "  - Video: 10× PoW, 7-day decay (aggressive!)"
echo ""
echo "  With video's 7-day decay, actual video storage is:"
video_7day=$(echo "scale=2; $video_storage * 7 / 30 * $RETENTION_RATE" | bc)
printf "    %.1f MB (vs %.1f MB at 30-day decay)\n" $video_7day $video_storage
echo ""
total_realistic=$(echo "scale=2; ($text_storage + $image_storage) * $RETENTION_RATE + $video_7day" | bc)
printf "  REALISTIC TOTAL (mixed decay): %.1f MB for 10K users\n" $total_realistic
per_user_realistic=$(echo "scale=2; $total_realistic / 10000" | bc)
printf "  Per user: %.2f MB (well under 500 MB target)\n" $per_user_realistic

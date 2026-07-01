#!/bin/bash
# Find viable storage parameters for Swimchain

echo "╔══════════════════════════════════════════════════════════════════════════╗"
echo "║                  FINDING VIABLE SWIMCHAIN PARAMETERS                     ║"
echo "╚══════════════════════════════════════════════════════════════════════════╝"
echo ""

TARGET_MB=500
POSTS_DAY=200   # Per lane
DAYS=30

echo "Target: ${TARGET_MB} MB per user"
echo ""

echo "=== Testing Combinations ==="
echo ""
printf "%-6s %-6s %-8s %-6s %-8s %-10s %-8s %s\n" \
    "TEXT%" "IMG%" "IMG_KB" "LANES" "DECAY" "LANE_MB" "USER_MB" "STATUS"
echo "────────────────────────────────────────────────────────────────────────────"

for TEXT_PCT in 95 90 85; do
    for IMAGE_KB in 30 50 75; do
        for LANES in 4 5 6 8; do
            for MEDIA_DECAY in 3 5 7; do
                # Calculate remaining %
                IMAGE_PCT=$((100 - TEXT_PCT - 2))  # 2% video always
                VIDEO_PCT=2

                TOTAL=$((POSTS_DAY * DAYS))

                text_posts=$((TOTAL * TEXT_PCT / 100))
                image_posts=$((TOTAL * IMAGE_PCT / 100))
                video_posts=$((TOTAL * VIDEO_PCT / 100))

                # Raw storage
                text_mb=$(echo "scale=4; $text_posts * 2 / 1024" | bc)
                image_mb=$(echo "scale=4; $image_posts * ($IMAGE_KB + 2) / 1024" | bc)
                video_mb=$(echo "scale=4; $video_posts * 5002 / 1024" | bc)

                # Decay
                text_ret=$(echo "scale=4; $text_mb * 0.52" | bc)
                image_ret=$(echo "scale=4; $image_mb * $MEDIA_DECAY / 30 * 0.52" | bc)
                video_ret=$(echo "scale=4; $video_mb * $MEDIA_DECAY / 30 * 0.52" | bc)

                lane_total=$(echo "scale=2; $text_ret + $image_ret + $video_ret" | bc)
                user_total=$(echo "scale=2; $lane_total * $LANES" | bc)

                if (( $(echo "$user_total <= $TARGET_MB" | bc -l) )); then
                    status="✅"
                else
                    status="❌"
                fi

                printf "%-6d %-6d %-8d %-6d %-8d %-10.1f %-8.1f %s\n" \
                    $TEXT_PCT $IMAGE_PCT $IMAGE_KB $LANES "${MEDIA_DECAY}d" $lane_total $user_total "$status"
            done
        done
    done
done

echo ""
echo "=== VIABLE CONFIGURATIONS (under 500 MB) ==="
echo ""
printf "%-6s %-6s %-8s %-6s %-8s %-10s %-8s\n" \
    "TEXT%" "IMG%" "IMG_KB" "LANES" "DECAY" "LANE_MB" "USER_MB"
echo "────────────────────────────────────────────────────────────────────────"

for TEXT_PCT in 95 90 85; do
    for IMAGE_KB in 30 50 75; do
        for LANES in 4 5 6 8; do
            for MEDIA_DECAY in 3 5 7; do
                IMAGE_PCT=$((100 - TEXT_PCT - 2))
                VIDEO_PCT=2

                TOTAL=$((POSTS_DAY * DAYS))

                text_posts=$((TOTAL * TEXT_PCT / 100))
                image_posts=$((TOTAL * IMAGE_PCT / 100))
                video_posts=$((TOTAL * VIDEO_PCT / 100))

                text_mb=$(echo "scale=4; $text_posts * 2 / 1024" | bc)
                image_mb=$(echo "scale=4; $image_posts * ($IMAGE_KB + 2) / 1024" | bc)
                video_mb=$(echo "scale=4; $video_posts * 5002 / 1024" | bc)

                text_ret=$(echo "scale=4; $text_mb * 0.52" | bc)
                image_ret=$(echo "scale=4; $image_mb * $MEDIA_DECAY / 30 * 0.52" | bc)
                video_ret=$(echo "scale=4; $video_mb * $MEDIA_DECAY / 30 * 0.52" | bc)

                lane_total=$(echo "scale=2; $text_ret + $image_ret + $video_ret" | bc)
                user_total=$(echo "scale=2; $lane_total * $LANES" | bc)

                if (( $(echo "$user_total <= $TARGET_MB" | bc -l) )); then
                    printf "%-6d %-6d %-8d %-6d %-8s %-10.1f %-8.1f\n" \
                        $TEXT_PCT $IMAGE_PCT $IMAGE_KB $LANES "${MEDIA_DECAY}d" $lane_total $user_total
                fi
            done
        done
    done
done

echo ""
echo "╔══════════════════════════════════════════════════════════════════════════╗"
echo "║                     RECOMMENDED CONFIGURATION                            ║"
echo "╠══════════════════════════════════════════════════════════════════════════╣"
echo "║                                                                          ║"
echo "║  Content mix:                                                            ║"
echo "║    • 95% text posts                                                      ║"
echo "║    • 3% image posts (max 50KB each)                                      ║"
echo "║    • 2% video posts (max 5MB, 60s)                                       ║"
echo "║                                                                          ║"
echo "║  Decay:                                                                  ║"
echo "║    • Text: 30-day half-life                                              ║"
echo "║    • Images/Video: 5-day half-life                                       ║"
echo "║                                                                          ║"
echo "║  Participation:                                                          ║"
echo "║    • 6 lanes per user (focused)                                          ║"
echo "║                                                                          ║"
echo "║  This gives: ~70 MB/lane × 6 lanes = ~420 MB per user                    ║"
echo "║                                                                          ║"
echo "║  PHILOSOPHY: Swimchain is for CONVERSATION.                              ║"
echo "║              Images and video are occasional, expensive luxuries.        ║"
echo "║              Text is the primary medium.                                 ║"
echo "║                                                                          ║"
echo "╚══════════════════════════════════════════════════════════════════════════╝"

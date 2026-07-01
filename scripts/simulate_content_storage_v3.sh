#!/bin/bash
# Content Storage Simulation v3 for Swimchain
# Finding the parameters that make 500MB/user work

echo "╔══════════════════════════════════════════════════════════════════════════╗"
echo "║              SWIMCHAIN CONTENT STORAGE SIMULATION v3                     ║"
echo "║                  (Finding Viable Parameters)                             ║"
echo "╚══════════════════════════════════════════════════════════════════════════╝"
echo ""

echo "=== THE PROBLEM ==="
echo ""
echo "  With current assumptions:"
echo "    - Images at 300KB each → 313 MB per lane"
echo "    - 12 lanes × 313 MB = 3,764 MB"
echo "    - ❌ 7.5× over 500 MB budget"
echo ""
echo "  The math doesn't work. Something has to give."
echo ""

echo "=== WHAT CAN WE ADJUST? ==="
echo ""
echo "  Option A: Smaller images (aggressive compression)"
echo "  Option B: Fewer images allowed (tighter limits)"
echo "  Option C: Faster image decay"
echo "  Option D: Fewer lanes synced"
echo "  Option E: Combination of above"
echo ""

echo "════════════════════════════════════════════════════════════════════════════"
echo "                           OPTION A: TINY IMAGES"
echo "════════════════════════════════════════════════════════════════════════════"
echo ""
echo "  What if images max 50KB (like old forums)?"
echo ""

# Parameters
POSTS_DAY=200
DAYS=30
TOTAL=$((POSTS_DAY * DAYS))

# Content mix
TEXT_PCT=75
IMAGE_PCT=22
VIDEO_PCT=3

text_posts=$((TOTAL * TEXT_PCT / 100))
image_posts=$((TOTAL * IMAGE_PCT / 100))
video_posts=$((TOTAL * VIDEO_PCT / 100))

# Tiny images: 50KB
tiny_img=50
text_mb=$(echo "scale=2; $text_posts * 2 / 1024" | bc)
image_mb=$(echo "scale=2; $image_posts * ($tiny_img + 2) / 1024" | bc)
video_mb=$(echo "scale=2; $video_posts * 5002 / 1024" | bc)

# Decay
text_ret=$(echo "scale=2; $text_mb * 0.52" | bc)
image_ret=$(echo "scale=2; $image_mb * 0.52" | bc)
video_ret=$(echo "scale=2; $video_mb * 7 / 30 * 0.52" | bc)

total=$(echo "scale=2; $text_ret + $image_ret + $video_ret" | bc)
user_total=$(echo "scale=2; $total * 12" | bc)

printf "  Image size: %d KB\n" $tiny_img
printf "  Per lane: %.1f MB\n" $total
printf "  12 lanes: %.1f MB\n" $user_total

if (( $(echo "$user_total <= 500" | bc -l) )); then
    echo "  ✅ WORKS"
else
    echo "  ❌ Still too big"
fi
echo ""

echo "════════════════════════════════════════════════════════════════════════════"
echo "                        OPTION B: TEXT-FIRST DESIGN"
echo "════════════════════════════════════════════════════════════════════════════"
echo ""
echo "  What if Swimchain is primarily TEXT with occasional images?"
echo "  Think: 2005 forums, not 2024 Instagram"
echo ""

# 90% text, 9% image, 1% video
TEXT_PCT2=90
IMAGE_PCT2=9
VIDEO_PCT2=1

text_posts2=$((TOTAL * TEXT_PCT2 / 100))
image_posts2=$((TOTAL * IMAGE_PCT2 / 100))
video_posts2=$((TOTAL * VIDEO_PCT2 / 100))

# 100KB images (reasonable compression)
img_size=100
text_mb2=$(echo "scale=2; $text_posts2 * 2 / 1024" | bc)
image_mb2=$(echo "scale=2; $image_posts2 * ($img_size + 2) / 1024" | bc)
video_mb2=$(echo "scale=2; $video_posts2 * 5002 / 1024" | bc)

# Decay
text_ret2=$(echo "scale=2; $text_mb2 * 0.52" | bc)
image_ret2=$(echo "scale=2; $image_mb2 * 0.52" | bc)
video_ret2=$(echo "scale=2; $video_mb2 * 7 / 30 * 0.52" | bc)

total2=$(echo "scale=2; $text_ret2 + $image_ret2 + $video_ret2" | bc)
user_total2=$(echo "scale=2; $total2 * 12" | bc)

echo "  Content mix: ${TEXT_PCT2}% text, ${IMAGE_PCT2}% image, ${VIDEO_PCT2}% video"
printf "  Image size: %d KB\n" $img_size
printf "  Per lane: %.1f MB\n" $total2
printf "  12 lanes: %.1f MB\n" $user_total2

if (( $(echo "$user_total2 <= 500" | bc -l) )); then
    echo "  ✅ WORKS"
else
    echo "  ❌ Still too big"
fi
echo ""

echo "════════════════════════════════════════════════════════════════════════════"
echo "                        OPTION C: FASTER IMAGE DECAY"
echo "════════════════════════════════════════════════════════════════════════════"
echo ""
echo "  What if images also have 7-day decay like video?"
echo ""

# Back to original mix
text_mb3=$(echo "scale=2; $text_posts * 2 / 1024" | bc)
image_mb3=$(echo "scale=2; $image_posts * 102 / 1024" | bc)  # 100KB images
video_mb3=$(echo "scale=2; $video_posts * 5002 / 1024" | bc)

# All media has 7-day decay
text_ret3=$(echo "scale=2; $text_mb3 * 0.52" | bc)
image_ret3=$(echo "scale=2; $image_mb3 * 7 / 30 * 0.52" | bc)  # 7-day decay
video_ret3=$(echo "scale=2; $video_mb3 * 7 / 30 * 0.52" | bc)

total3=$(echo "scale=2; $text_ret3 + $image_ret3 + $video_ret3" | bc)
user_total3=$(echo "scale=2; $total3 * 12" | bc)

echo "  Decay: Text 30-day, Images/Video 7-day"
printf "  Per lane: %.1f MB\n" $total3
printf "  12 lanes: %.1f MB\n" $user_total3

if (( $(echo "$user_total3 <= 500" | bc -l) )); then
    echo "  ✅ WORKS"
else
    echo "  ❌ Still too big"
fi
echo ""

echo "════════════════════════════════════════════════════════════════════════════"
echo "                       OPTION D: FEWER LANES"
echo "════════════════════════════════════════════════════════════════════════════"
echo ""
echo "  What if users sync 3-4 lanes instead of 12?"
echo ""

# With text-first design from Option B
user_4lanes=$(echo "scale=2; $total2 * 4" | bc)
user_6lanes=$(echo "scale=2; $total2 * 6" | bc)

printf "  4 lanes (text-first): %.1f MB\n" $user_4lanes
printf "  6 lanes (text-first): %.1f MB\n" $user_6lanes

echo ""

echo "════════════════════════════════════════════════════════════════════════════"
echo "                          THE HYBRID SOLUTION"
echo "════════════════════════════════════════════════════════════════════════════"
echo ""
echo "  Combine multiple constraints:"
echo ""
echo "  1. Text-first: 90% text, 8% images, 2% video"
echo "  2. Small images: 100KB max (not 500KB)"
echo "  3. Fast media decay: 7 days for images/video"
echo "  4. Reasonable lanes: 8 lanes per user"
echo ""

# Hybrid calculation
HYBRID_TEXT_PCT=90
HYBRID_IMAGE_PCT=8
HYBRID_VIDEO_PCT=2

hybrid_text=$((TOTAL * HYBRID_TEXT_PCT / 100))
hybrid_image=$((TOTAL * HYBRID_IMAGE_PCT / 100))
hybrid_video=$((TOTAL * HYBRID_VIDEO_PCT / 100))

hybrid_text_mb=$(echo "scale=2; $hybrid_text * 2 / 1024" | bc)
hybrid_image_mb=$(echo "scale=2; $hybrid_image * 102 / 1024" | bc)  # 100KB
hybrid_video_mb=$(echo "scale=2; $hybrid_video * 5002 / 1024" | bc)

# Decay: text 30-day, media 7-day
hybrid_text_ret=$(echo "scale=2; $hybrid_text_mb * 0.52" | bc)
hybrid_image_ret=$(echo "scale=2; $hybrid_image_mb * 7 / 30 * 0.52" | bc)
hybrid_video_ret=$(echo "scale=2; $hybrid_video_mb * 7 / 30 * 0.52" | bc)

hybrid_total=$(echo "scale=2; $hybrid_text_ret + $hybrid_image_ret + $hybrid_video_ret" | bc)
hybrid_user=$(echo "scale=2; $hybrid_total * 8" | bc)

printf "  Per lane:     %.1f MB\n" $hybrid_total
printf "  8 lanes:      %.1f MB\n" $hybrid_user

if (( $(echo "$hybrid_user <= 500" | bc -l) )); then
    echo ""
    echo "  ✅ WORKS!"
    echo ""
    sync_sec=$(echo "scale=0; $hybrid_user / 0.125" | bc)
    sync_min=$(echo "scale=1; $sync_sec / 60" | bc)
    printf "  Sync time (1 Mbps): %.1f minutes\n" $sync_min
else
    echo "  ❌ Still too big"
fi
echo ""

echo "╔══════════════════════════════════════════════════════════════════════════╗"
echo "║                         DESIGN IMPLICATIONS                              ║"
echo "╠══════════════════════════════════════════════════════════════════════════╣"
echo "║                                                                          ║"
echo "║  To hit 500 MB target, Swimchain must be:                                ║"
echo "║                                                                          ║"
echo "║  ✓ TEXT-FIRST (90%+ text posts)                                          ║"
echo "║    - This matches 'conversation over media' philosophy                   ║"
echo "║    - Images are supplemental, not primary                                ║"
echo "║                                                                          ║"
echo "║  ✓ SMALL IMAGES (100KB max, not 500KB)                                   ║"
echo "║    - Aggressive compression required                                     ║"
echo "║    - Think thumbnails, not full-res photos                               ║"
echo "║                                                                          ║"
echo "║  ✓ EPHEMERAL MEDIA (7-day decay for images/video)                        ║"
echo "║    - Text persists (30-day decay)                                        ║"
echo "║    - Media drifts fast                                                   ║"
echo "║    - Want to keep an image? Link to it, don't host it                    ║"
echo "║                                                                          ║"
echo "║  ✓ FOCUSED PARTICIPATION (8-10 lanes, not 12)                            ║"
echo "║    - 'Stay in your lane' literally                                       ║"
echo "║    - Quality over quantity of communities                                ║"
echo "║                                                                          ║"
echo "║  This is INTENTIONAL, not a limitation:                                  ║"
echo "║  - Swimchain is for conversation, not media sharing                      ║"
echo "║  - Text is friction-light, media is friction-heavy                       ║"
echo "║  - Forces intentionality about what media to share                       ║"
echo "║                                                                          ║"
echo "╚══════════════════════════════════════════════════════════════════════════╝"

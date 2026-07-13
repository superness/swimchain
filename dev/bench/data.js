window.BENCHMARK_DATA = {
  "lastUpdate": 1783952600196,
  "repoUrl": "https://github.com/superness/swimchain",
  "entries": {
    "Swimchain benchmarks": [
      {
        "commit": {
          "author": {
            "email": "super.hero.excuse@gmail.com",
            "name": "superness",
            "username": "superness"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "b74c540d5c7c02b20dc724027d9978c0d3d5dbec",
          "message": "fix(bench): disable RPC in multi_node bench nodes to stop port collisions (#77)\n\nWith rpc_port unset, every bench node binds the same fixed default RPC\nport. Sequential start/stop benches survive that, but harness_creation\nboots 2-10 nodes concurrently and the second node dies with Address\nalready in use (perf run 29177193923, multi_node.rs:100). These benches\nnever issue RPC calls, so turn the server off.\n\nCo-authored-by: AdminWizard <admin@adminwizard.tech>\nCo-authored-by: Claude Fable 5 <noreply@anthropic.com>",
          "timestamp": "2026-07-11T23:05:08-04:00",
          "tree_id": "fc75080cad06ee665a9e616ab29d7f455f53c188",
          "url": "https://github.com/superness/swimchain/commit/b74c540d5c7c02b20dc724027d9978c0d3d5dbec"
        },
        "date": 1783827707478,
        "tool": "cargo",
        "benches": [
          {
            "name": "mobile_single_hash/mobile_64mib_p2",
            "value": 90054347,
            "range": "± 392013",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_single_hash/desktop_64mib_p4",
            "value": 90850186,
            "range": "± 521057",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_single_hash/test_1mib_p1",
            "value": 399915,
            "range": "± 252",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/4",
            "value": 1223959998,
            "range": "± 919396316",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/6",
            "value": 7269254708,
            "range": "± 5215801813",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/8",
            "value": 26159331877,
            "range": "± 29036539364",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/4",
            "value": 5728397,
            "range": "± 812772",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/6",
            "value": 22475548,
            "range": "± 5652965",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/8",
            "value": 99629923,
            "range": "± 75505649",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/10",
            "value": 188265420,
            "range": "± 193003401",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/12",
            "value": 927461386,
            "range": "± 856096593",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Post",
            "value": 721662512,
            "range": "± 1130019258",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Reply",
            "value": 811925142,
            "range": "± 1274909325",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Engage",
            "value": 675218690,
            "range": "± 890553729",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/3G_2mbps",
            "value": 3042367376,
            "range": "± 3621409",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/4G_10mbps",
            "value": 2985,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/WiFi_50mbps",
            "value": 2990,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/1KB",
            "value": 4717,
            "range": "± 5",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/4KB",
            "value": 1218,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/16KB",
            "value": 364,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/64KB",
            "value": 127,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "node_startup",
            "value": 2492748466,
            "range": "± 80105890",
            "unit": "ns/iter"
          },
          {
            "name": "node_shutdown",
            "value": 2356323561,
            "range": "± 2821941",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/2",
            "value": 4830271372,
            "range": "± 26372936",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/3",
            "value": 7229513839,
            "range": "± 201098924",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/5",
            "value": 12049123205,
            "range": "± 44021863",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/10",
            "value": 24088486539,
            "range": "± 331695531",
            "unit": "ns/iter"
          },
          {
            "name": "chain_store_access",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "connection_manager_access",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_info",
            "value": 167310,
            "range": "± 1814",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_sync_status",
            "value": 650745,
            "range": "± 2390",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_chain_stats",
            "value": 168812,
            "range": "± 1087",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_peers",
            "value": 159163,
            "range": "± 1482",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/list_spaces",
            "value": 162912,
            "range": "± 1441",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/feed_poll",
            "value": 981934,
            "range": "± 7809",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/create_space",
            "value": 7406897,
            "range": "± 1206776",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/submit_post",
            "value": 20736422,
            "range": "± 1736492",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/list_space_content_populated",
            "value": 4513058,
            "range": "± 17942",
            "unit": "ns/iter"
          },
          {
            "name": "keypair_generation",
            "value": 18709,
            "range": "± 46",
            "unit": "ns/iter"
          },
          {
            "name": "sign_32bytes",
            "value": 37017,
            "range": "± 283",
            "unit": "ns/iter"
          },
          {
            "name": "sign_1kb",
            "value": 42010,
            "range": "± 603",
            "unit": "ns/iter"
          },
          {
            "name": "verify_signature",
            "value": 40031,
            "range": "± 126",
            "unit": "ns/iter"
          },
          {
            "name": "encode_address",
            "value": 333,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "decode_address",
            "value": 483,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/8",
            "value": 36411,
            "range": "± 258",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/12",
            "value": 307192,
            "range": "± 9209",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/16",
            "value": 4437519,
            "range": "± 567282",
            "unit": "ns/iter"
          },
          {
            "name": "encrypt_private_key",
            "value": 91739757,
            "range": "± 680761",
            "unit": "ns/iter"
          },
          {
            "name": "decrypt_private_key",
            "value": 91789028,
            "range": "± 318841",
            "unit": "ns/iter"
          },
          {
            "name": "export_identity",
            "value": 91743711,
            "range": "± 502986",
            "unit": "ns/iter"
          },
          {
            "name": "import_identity",
            "value": 92697639,
            "range": "± 1314410",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_1mib",
            "value": 393240,
            "range": "± 4911",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/4",
            "value": 6783270,
            "range": "± 1235546",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/8",
            "value": 89944726,
            "range": "± 38266799",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/10",
            "value": 575354465,
            "range": "± 412182257",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/12",
            "value": 1464542024,
            "range": "± 1067786156",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_64mib",
            "value": 96208434,
            "range": "± 942850",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_mobile",
            "value": 95742250,
            "range": "± 177025",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/test_1mib",
            "value": 393068,
            "range": "± 430",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/mobile_64mib_p2",
            "value": 95548840,
            "range": "± 668160",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/prod_64mib_p4",
            "value": 96776958,
            "range": "± 391247",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/100",
            "value": 1828315,
            "range": "± 50202",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/500",
            "value": 6007653,
            "range": "± 43675",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/1000",
            "value": 11785694,
            "range": "± 95871",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/100",
            "value": 234,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/1000",
            "value": 248,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/5000",
            "value": 317,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "insert_with_branch/insert_default_threshold",
            "value": 24963,
            "range": "± 1872",
            "unit": "ns/iter"
          },
          {
            "name": "insert_with_branch/insert_small_threshold",
            "value": 99550,
            "range": "± 12355",
            "unit": "ns/iter"
          },
          {
            "name": "space_state_lookup/get_space_branch_state",
            "value": 232,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "hash_branch_matching/assign_branch_unfractured",
            "value": 212,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "hash_branch_matching/assign_branch_fractured",
            "value": 266,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/2MB",
            "value": 1410950,
            "range": "± 4419",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/10MB",
            "value": 11258776,
            "range": "± 29942",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/50MB",
            "value": 56536647,
            "range": "± 389498",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/100MB",
            "value": 112536151,
            "range": "± 194945",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/2MB",
            "value": 2761861,
            "range": "± 22848",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/10MB",
            "value": 13970545,
            "range": "± 135125",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/50MB",
            "value": 90361941,
            "range": "± 501182",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/2MB",
            "value": 1508050,
            "range": "± 1727",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/10MB",
            "value": 7735356,
            "range": "± 115594",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/50MB",
            "value": 40295127,
            "range": "± 188158",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/2",
            "value": 765,
            "range": "± 5",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/10",
            "value": 3413,
            "range": "± 218",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/50",
            "value": 15799,
            "range": "± 28",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/100",
            "value": 31122,
            "range": "± 105",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/500",
            "value": 150618,
            "range": "± 325",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/1024",
            "value": 307369,
            "range": "± 449",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/2",
            "value": 838,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/10",
            "value": 3678,
            "range": "± 6",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/50",
            "value": 17708,
            "range": "± 35",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/100",
            "value": 34800,
            "range": "± 612",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/500",
            "value": 170655,
            "range": "± 1246",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/1024",
            "value": 352331,
            "range": "± 10060",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/1MB",
            "value": 697640,
            "range": "± 3718",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/10MB",
            "value": 6993181,
            "range": "± 12274",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/100MB",
            "value": 109074150,
            "range": "± 1776470",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/500MB",
            "value": 556121129,
            "range": "± 3030634",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/1024MB",
            "value": 1148983397,
            "range": "± 12593939",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/10",
            "value": 33881,
            "range": "± 322",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/50",
            "value": 136727,
            "range": "± 1557",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/100",
            "value": 258463,
            "range": "± 714",
            "unit": "ns/iter"
          },
          {
            "name": "decay_simulation/10k_posts_60_days",
            "value": 16056004,
            "range": "± 372504",
            "unit": "ns/iter"
          },
          {
            "name": "decay_simulation_large/100k_posts_60_days",
            "value": 202761004,
            "range": "± 2587226",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/1000",
            "value": 28,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/10000",
            "value": 52470,
            "range": "± 437",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/50000",
            "value": 239642,
            "range": "± 2209",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/100",
            "value": 29807,
            "range": "± 76",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/1000",
            "value": 302678,
            "range": "± 1563",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/10000",
            "value": 3005328,
            "range": "± 3624",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/100000",
            "value": 30391215,
            "range": "± 25061",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/1000",
            "value": 1624,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/10000",
            "value": 25653,
            "range": "± 65",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/100000",
            "value": 201117,
            "range": "± 817",
            "unit": "ns/iter"
          },
          {
            "name": "header_hash",
            "value": 319,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "meets_difficulty",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Budget_1GB",
            "value": 2939783,
            "range": "± 6893",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Standard_5GB",
            "value": 15404748,
            "range": "± 47230",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Flagship_10GB",
            "value": 31251098,
            "range": "± 155022",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/50",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/75",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/90",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/95",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/99",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/1KB",
            "value": 396520,
            "range": "± 21143",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/10KB",
            "value": 430841,
            "range": "± 21028",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/100KB",
            "value": 630872,
            "range": "± 16320",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/100",
            "value": 1395,
            "range": "± 22",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/1000",
            "value": 15820,
            "range": "± 424",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/10000",
            "value": 210934,
            "range": "± 2476",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/steady_state",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/daily_growth",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/avg_post_size",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/10_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/100_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/1000_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/10000_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/budget_1gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/standard_5gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/flagship_10gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/root_block",
            "value": 4704,
            "range": "± 356",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/space_block",
            "value": 632,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/content_block",
            "value": 588,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/1024",
            "value": 9449,
            "range": "± 8336",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/4096",
            "value": 18084,
            "range": "± 15533",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/65536",
            "value": 147257,
            "range": "± 69543",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/1048576",
            "value": 2115448,
            "range": "± 132736",
            "unit": "ns/iter"
          },
          {
            "name": "random_read/root_block_1000",
            "value": 718,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/1024_bytes",
            "value": 8521,
            "range": "± 13",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/65536_bytes",
            "value": 51620,
            "range": "± 158",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/1048576_bytes",
            "value": 729287,
            "range": "± 1330",
            "unit": "ns/iter"
          },
          {
            "name": "cache/add_entry",
            "value": 573,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "cache/access",
            "value": 277,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/100",
            "value": 28714,
            "range": "± 86",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/1000",
            "value": 53279,
            "range": "± 324",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/10000",
            "value": 53556,
            "range": "± 190",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/1048576_bytes",
            "value": 699624,
            "range": "± 240",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/5242880_bytes",
            "value": 3500844,
            "range": "± 2595",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/10485760_bytes",
            "value": 6997679,
            "range": "± 2653",
            "unit": "ns/iter"
          },
          {
            "name": "startup/empty_db",
            "value": 2235048,
            "range": "± 69407",
            "unit": "ns/iter"
          },
          {
            "name": "startup/populated_db",
            "value": 6017587,
            "range": "± 156820",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/100",
            "value": 511267,
            "range": "± 16686",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/1000",
            "value": 640686,
            "range": "± 8785",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/10000",
            "value": 645329,
            "range": "± 8061",
            "unit": "ns/iter"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "admin@adminwizard.tech",
            "name": "AdminWizard"
          },
          "committer": {
            "email": "admin@adminwizard.tech",
            "name": "AdminWizard"
          },
          "distinct": true,
          "id": "a8c94b14c610c89eb2d30c9895a6aa55784a6223",
          "message": "fix(action): keep public-action hash backward-compatible across the 466 fork\n\nAction::hash() now hashes a public action (private==false) over the legacy\n465-byte layout (no trailing private byte), so its hash is byte-identical to\nthe pre-confidentiality encoding. This preserves the identity of all existing\npublic content and keeps existing block merkle roots valid on upgraded nodes —\nverify_merkle_root() recomputes action hashes during sync, so an always-466\nhash would have rejected the entire pre-fork chain. Private actions hash over\nthe full 466 bytes. The on-wire action still grows to 466 (the intended\ncoordinated testnet break); only the hash preimage is version-aware.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>",
          "timestamp": "2026-07-11T23:38:27-04:00",
          "tree_id": "dbc25f4135ab0609ebb42c70acd92f94fa408178",
          "url": "https://github.com/superness/swimchain/commit/a8c94b14c610c89eb2d30c9895a6aa55784a6223"
        },
        "date": 1783829157339,
        "tool": "cargo",
        "benches": [
          {
            "name": "mobile_single_hash/mobile_64mib_p2",
            "value": 90030465,
            "range": "± 173093",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_single_hash/desktop_64mib_p4",
            "value": 90711633,
            "range": "± 278707",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_single_hash/test_1mib_p1",
            "value": 401437,
            "range": "± 381",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/4",
            "value": 1488198294,
            "range": "± 656188252",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/6",
            "value": 3002881514,
            "range": "± 2921417500",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/8",
            "value": 13135281892,
            "range": "± 18186308197",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/4",
            "value": 6032089,
            "range": "± 761029",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/6",
            "value": 20716703,
            "range": "± 7348046",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/8",
            "value": 112086000,
            "range": "± 67608338",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/10",
            "value": 218027386,
            "range": "± 192968932",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/12",
            "value": 1156952528,
            "range": "± 1697092566",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Post",
            "value": 985957094,
            "range": "± 989963814",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Reply",
            "value": 583553055,
            "range": "± 1135497471",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Engage",
            "value": 1297142522,
            "range": "± 1616196118",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/3G_2mbps",
            "value": 3038102215,
            "range": "± 2334073",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/4G_10mbps",
            "value": 2985,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/WiFi_50mbps",
            "value": 2989,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/1KB",
            "value": 4716,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/4KB",
            "value": 1217,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/16KB",
            "value": 364,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/64KB",
            "value": 127,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "node_startup",
            "value": 2571026434,
            "range": "± 88865262",
            "unit": "ns/iter"
          },
          {
            "name": "node_shutdown",
            "value": 2360674865,
            "range": "± 3140600",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/2",
            "value": 4874149878,
            "range": "± 41479920",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/3",
            "value": 7244337342,
            "range": "± 92567967",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/5",
            "value": 12155510979,
            "range": "± 279701836",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/10",
            "value": 24221403207,
            "range": "± 327377103",
            "unit": "ns/iter"
          },
          {
            "name": "chain_store_access",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "connection_manager_access",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_info",
            "value": 165633,
            "range": "± 4799",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_sync_status",
            "value": 643973,
            "range": "± 3928",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_chain_stats",
            "value": 167066,
            "range": "± 760",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_peers",
            "value": 156852,
            "range": "± 2211",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/list_spaces",
            "value": 161040,
            "range": "± 1462",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/feed_poll",
            "value": 988445,
            "range": "± 7018",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/create_space",
            "value": 7751839,
            "range": "± 1107368",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/submit_post",
            "value": 19649171,
            "range": "± 2376339",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/list_space_content_populated",
            "value": 4369767,
            "range": "± 23320",
            "unit": "ns/iter"
          },
          {
            "name": "keypair_generation",
            "value": 20890,
            "range": "± 20",
            "unit": "ns/iter"
          },
          {
            "name": "sign_32bytes",
            "value": 41172,
            "range": "± 866",
            "unit": "ns/iter"
          },
          {
            "name": "sign_1kb",
            "value": 45622,
            "range": "± 168",
            "unit": "ns/iter"
          },
          {
            "name": "verify_signature",
            "value": 51874,
            "range": "± 26",
            "unit": "ns/iter"
          },
          {
            "name": "encode_address",
            "value": 361,
            "range": "± 13",
            "unit": "ns/iter"
          },
          {
            "name": "decode_address",
            "value": 530,
            "range": "± 5",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/8",
            "value": 40423,
            "range": "± 287",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/12",
            "value": 334681,
            "range": "± 7618",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/16",
            "value": 5365720,
            "range": "± 835509",
            "unit": "ns/iter"
          },
          {
            "name": "encrypt_private_key",
            "value": 95934555,
            "range": "± 1901219",
            "unit": "ns/iter"
          },
          {
            "name": "decrypt_private_key",
            "value": 97567115,
            "range": "± 1946328",
            "unit": "ns/iter"
          },
          {
            "name": "export_identity",
            "value": 95156546,
            "range": "± 1407847",
            "unit": "ns/iter"
          },
          {
            "name": "import_identity",
            "value": 95361124,
            "range": "± 4702831",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_1mib",
            "value": 390478,
            "range": "± 299",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/4",
            "value": 6248451,
            "range": "± 1204301",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/8",
            "value": 82376247,
            "range": "± 33579119",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/10",
            "value": 215744006,
            "range": "± 189629783",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/12",
            "value": 2782275602,
            "range": "± 1911745359",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_64mib",
            "value": 98424930,
            "range": "± 1397733",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_mobile",
            "value": 100825633,
            "range": "± 723690",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/test_1mib",
            "value": 391882,
            "range": "± 354",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/mobile_64mib_p2",
            "value": 100080319,
            "range": "± 672695",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/prod_64mib_p4",
            "value": 99761980,
            "range": "± 748033",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/100",
            "value": 1642107,
            "range": "± 307648",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/500",
            "value": 5736801,
            "range": "± 100118",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/1000",
            "value": 11460225,
            "range": "± 149286",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/100",
            "value": 253,
            "range": "± 7",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/1000",
            "value": 263,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/5000",
            "value": 342,
            "range": "± 6",
            "unit": "ns/iter"
          },
          {
            "name": "insert_with_branch/insert_default_threshold",
            "value": 23789,
            "range": "± 1804",
            "unit": "ns/iter"
          },
          {
            "name": "insert_with_branch/insert_small_threshold",
            "value": 100702,
            "range": "± 12713",
            "unit": "ns/iter"
          },
          {
            "name": "space_state_lookup/get_space_branch_state",
            "value": 270,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "hash_branch_matching/assign_branch_unfractured",
            "value": 231,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "hash_branch_matching/assign_branch_fractured",
            "value": 292,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/2MB",
            "value": 1548885,
            "range": "± 539",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/10MB",
            "value": 12942699,
            "range": "± 67313",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/50MB",
            "value": 65036624,
            "range": "± 277127",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/100MB",
            "value": 130182745,
            "range": "± 630409",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/2MB",
            "value": 3079633,
            "range": "± 22400",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/10MB",
            "value": 15501814,
            "range": "± 101613",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/50MB",
            "value": 103154591,
            "range": "± 815377",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/2MB",
            "value": 1684469,
            "range": "± 780",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/10MB",
            "value": 8437365,
            "range": "± 9721",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/50MB",
            "value": 44093605,
            "range": "± 76102",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/2",
            "value": 730,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/10",
            "value": 3170,
            "range": "± 9",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/50",
            "value": 14078,
            "range": "± 30",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/100",
            "value": 27475,
            "range": "± 19",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/500",
            "value": 137745,
            "range": "± 1481",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/1024",
            "value": 278363,
            "range": "± 555",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/2",
            "value": 899,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/10",
            "value": 3874,
            "range": "± 6",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/50",
            "value": 18221,
            "range": "± 14",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/100",
            "value": 35801,
            "range": "± 29",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/500",
            "value": 178452,
            "range": "± 423",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/1024",
            "value": 368664,
            "range": "± 2133",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/1MB",
            "value": 777446,
            "range": "± 5082",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/10MB",
            "value": 7903925,
            "range": "± 48011",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/100MB",
            "value": 130360693,
            "range": "± 217432",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/500MB",
            "value": 646743075,
            "range": "± 7895338",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/1024MB",
            "value": 1323693312,
            "range": "± 2509462",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/10",
            "value": 38045,
            "range": "± 119",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/50",
            "value": 146307,
            "range": "± 359",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/100",
            "value": 281998,
            "range": "± 3313",
            "unit": "ns/iter"
          },
          {
            "name": "decay_simulation/10k_posts_60_days",
            "value": 18904780,
            "range": "± 610900",
            "unit": "ns/iter"
          },
          {
            "name": "decay_simulation_large/100k_posts_60_days",
            "value": 233686904,
            "range": "± 3717908",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/1000",
            "value": 30,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/10000",
            "value": 49955,
            "range": "± 694",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/50000",
            "value": 223333,
            "range": "± 2652",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/100",
            "value": 31889,
            "range": "± 33",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/1000",
            "value": 328695,
            "range": "± 211",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/10000",
            "value": 3290265,
            "range": "± 2119",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/100000",
            "value": 33097416,
            "range": "± 10760",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/1000",
            "value": 1967,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/10000",
            "value": 18454,
            "range": "± 25",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/100000",
            "value": 152602,
            "range": "± 437",
            "unit": "ns/iter"
          },
          {
            "name": "header_hash",
            "value": 337,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "meets_difficulty",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Budget_1GB",
            "value": 2965564,
            "range": "± 57768",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Standard_5GB",
            "value": 15543885,
            "range": "± 176253",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Flagship_10GB",
            "value": 31399195,
            "range": "± 318880",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/50",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/75",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/90",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/95",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/99",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/1KB",
            "value": 412583,
            "range": "± 28821",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/10KB",
            "value": 450601,
            "range": "± 26194",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/100KB",
            "value": 643498,
            "range": "± 30499",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/100",
            "value": 1383,
            "range": "± 8",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/1000",
            "value": 15271,
            "range": "± 270",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/10000",
            "value": 213884,
            "range": "± 3082",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/steady_state",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/daily_growth",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/avg_post_size",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/10_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/100_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/1000_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/10000_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/budget_1gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/standard_5gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/flagship_10gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/root_block",
            "value": 4949,
            "range": "± 500",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/space_block",
            "value": 636,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/content_block",
            "value": 606,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/1024",
            "value": 10065,
            "range": "± 9018",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/4096",
            "value": 18780,
            "range": "± 16403",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/65536",
            "value": 154329,
            "range": "± 69831",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/1048576",
            "value": 2186833,
            "range": "± 132202",
            "unit": "ns/iter"
          },
          {
            "name": "random_read/root_block_1000",
            "value": 708,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/1024_bytes",
            "value": 8543,
            "range": "± 12",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/65536_bytes",
            "value": 51896,
            "range": "± 146",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/1048576_bytes",
            "value": 731522,
            "range": "± 1103",
            "unit": "ns/iter"
          },
          {
            "name": "cache/add_entry",
            "value": 583,
            "range": "± 18",
            "unit": "ns/iter"
          },
          {
            "name": "cache/access",
            "value": 278,
            "range": "± 6",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/100",
            "value": 29115,
            "range": "± 224",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/1000",
            "value": 54113,
            "range": "± 188",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/10000",
            "value": 54121,
            "range": "± 325",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/1048576_bytes",
            "value": 695880,
            "range": "± 924",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/5242880_bytes",
            "value": 3510218,
            "range": "± 14139",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/10485760_bytes",
            "value": 7004943,
            "range": "± 4633",
            "unit": "ns/iter"
          },
          {
            "name": "startup/empty_db",
            "value": 2313440,
            "range": "± 65009",
            "unit": "ns/iter"
          },
          {
            "name": "startup/populated_db",
            "value": 6212692,
            "range": "± 90113",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/100",
            "value": 515866,
            "range": "± 15997",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/1000",
            "value": 646391,
            "range": "± 19236",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/10000",
            "value": 654687,
            "range": "± 15144",
            "unit": "ns/iter"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "admin@adminwizard.tech",
            "name": "AdminWizard"
          },
          "committer": {
            "email": "admin@adminwizard.tech",
            "name": "AdminWizard"
          },
          "distinct": true,
          "id": "77b19bacfe6ac7a6be9ef8340ffe48110ac4cde9",
          "message": "fix(action): exclude private flag from serde/bincode storage encoding\n\nContentBlock is persisted via bincode (not self-describing), and it embeds\nVec<Action>. Adding `private` to Action's serde layout corrupted reads of every\npre-existing stored block (\"invalid u8 while decoding bool\"), making all prior\ntestnet content unreadable on upgraded nodes.\n\nMark `private` #[serde(skip)] so the storage/bincode encoding is byte-identical\nto before — old blocks deserialize cleanly, `private` defaults to false on the\nstorage path. The bit still travels on the wire via the manual 466-byte\nserialize()/deserialize(); only the serde path (storage, mempool.bin, RPC JSON)\nomits it. Re-deriving the bit for stored private content is a serve-gating (P3)\nconcern; no private content exists yet.\n\nRegression test: bincode of a private vs public action is byte-identical and\ndecodes to private=false.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>",
          "timestamp": "2026-07-12T00:01:18-04:00",
          "tree_id": "7a2610c34c6f7a62e4c182931617288d18f18a19",
          "url": "https://github.com/superness/swimchain/commit/77b19bacfe6ac7a6be9ef8340ffe48110ac4cde9"
        },
        "date": 1783830662712,
        "tool": "cargo",
        "benches": [
          {
            "name": "mobile_single_hash/mobile_64mib_p2",
            "value": 95292278,
            "range": "± 286755",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_single_hash/desktop_64mib_p4",
            "value": 95335797,
            "range": "± 882727",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_single_hash/test_1mib_p1",
            "value": 401880,
            "range": "± 464",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/4",
            "value": 1016290598,
            "range": "± 712704483",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/6",
            "value": 2816141893,
            "range": "± 1905566169",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/8",
            "value": 15271278696,
            "range": "± 10004692412",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/4",
            "value": 6506162,
            "range": "± 1028311",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/6",
            "value": 27127701,
            "range": "± 3816713",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/8",
            "value": 107211694,
            "range": "± 45576643",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/10",
            "value": 416789963,
            "range": "± 490680774",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/12",
            "value": 2150964753,
            "range": "± 738152540",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Post",
            "value": 751337233,
            "range": "± 1083852793",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Reply",
            "value": 1036981027,
            "range": "± 1209797834",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Engage",
            "value": 1586615256,
            "range": "± 964003863",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/3G_2mbps",
            "value": 3039710667,
            "range": "± 1103724",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/4G_10mbps",
            "value": 2983,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/WiFi_50mbps",
            "value": 2990,
            "range": "± 16",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/1KB",
            "value": 4720,
            "range": "± 41",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/4KB",
            "value": 1218,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/16KB",
            "value": 364,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/64KB",
            "value": 127,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "node_startup",
            "value": 2450601019,
            "range": "± 73350375",
            "unit": "ns/iter"
          },
          {
            "name": "node_shutdown",
            "value": 2358301599,
            "range": "± 3826869",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/2",
            "value": 4820654960,
            "range": "± 27885376",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/3",
            "value": 7207466386,
            "range": "± 35308103",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/5",
            "value": 12054741629,
            "range": "± 202541445",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/10",
            "value": 24049957639,
            "range": "± 251328344",
            "unit": "ns/iter"
          },
          {
            "name": "chain_store_access",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "connection_manager_access",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_info",
            "value": 173374,
            "range": "± 4235",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_sync_status",
            "value": 662309,
            "range": "± 2625",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_chain_stats",
            "value": 169613,
            "range": "± 2041",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_peers",
            "value": 161947,
            "range": "± 2302",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/list_spaces",
            "value": 165186,
            "range": "± 2893",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/feed_poll",
            "value": 1005194,
            "range": "± 7936",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/create_space",
            "value": 7699200,
            "range": "± 744278",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/submit_post",
            "value": 20722914,
            "range": "± 1639340",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/list_space_content_populated",
            "value": 5403417,
            "range": "± 71297",
            "unit": "ns/iter"
          },
          {
            "name": "keypair_generation",
            "value": 18691,
            "range": "± 92",
            "unit": "ns/iter"
          },
          {
            "name": "sign_32bytes",
            "value": 36969,
            "range": "± 14",
            "unit": "ns/iter"
          },
          {
            "name": "sign_1kb",
            "value": 41138,
            "range": "± 434",
            "unit": "ns/iter"
          },
          {
            "name": "verify_signature",
            "value": 40023,
            "range": "± 76",
            "unit": "ns/iter"
          },
          {
            "name": "encode_address",
            "value": 334,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decode_address",
            "value": 482,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/8",
            "value": 36507,
            "range": "± 220",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/12",
            "value": 312347,
            "range": "± 15617",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/16",
            "value": 5087286,
            "range": "± 560174",
            "unit": "ns/iter"
          },
          {
            "name": "encrypt_private_key",
            "value": 87470761,
            "range": "± 353197",
            "unit": "ns/iter"
          },
          {
            "name": "decrypt_private_key",
            "value": 87530072,
            "range": "± 627381",
            "unit": "ns/iter"
          },
          {
            "name": "export_identity",
            "value": 88350925,
            "range": "± 979040",
            "unit": "ns/iter"
          },
          {
            "name": "import_identity",
            "value": 89735633,
            "range": "± 456151",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_1mib",
            "value": 391577,
            "range": "± 815",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/4",
            "value": 6163455,
            "range": "± 693052",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/8",
            "value": 80553737,
            "range": "± 37373771",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/10",
            "value": 79418925,
            "range": "± 223995653",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/12",
            "value": 1815644731,
            "range": "± 949094406",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_64mib",
            "value": 90314045,
            "range": "± 301962",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_mobile",
            "value": 89234523,
            "range": "± 183794",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/test_1mib",
            "value": 390603,
            "range": "± 651",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/mobile_64mib_p2",
            "value": 88983454,
            "range": "± 218212",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/prod_64mib_p4",
            "value": 89808301,
            "range": "± 230087",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/100",
            "value": 1765584,
            "range": "± 46539",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/500",
            "value": 5575005,
            "range": "± 55206",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/1000",
            "value": 10755897,
            "range": "± 74099",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/100",
            "value": 231,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/1000",
            "value": 246,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/5000",
            "value": 314,
            "range": "± 9",
            "unit": "ns/iter"
          },
          {
            "name": "insert_with_branch/insert_default_threshold",
            "value": 22804,
            "range": "± 1669",
            "unit": "ns/iter"
          },
          {
            "name": "insert_with_branch/insert_small_threshold",
            "value": 99114,
            "range": "± 13848",
            "unit": "ns/iter"
          },
          {
            "name": "space_state_lookup/get_space_branch_state",
            "value": 232,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "hash_branch_matching/assign_branch_unfractured",
            "value": 208,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "hash_branch_matching/assign_branch_fractured",
            "value": 248,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/2MB",
            "value": 1393832,
            "range": "± 832",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/10MB",
            "value": 10926331,
            "range": "± 21552",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/50MB",
            "value": 56274961,
            "range": "± 1020416",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/100MB",
            "value": 113089328,
            "range": "± 448426",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/2MB",
            "value": 2749773,
            "range": "± 22620",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/10MB",
            "value": 13847024,
            "range": "± 170849",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/50MB",
            "value": 90848170,
            "range": "± 574902",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/2MB",
            "value": 1503568,
            "range": "± 3205",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/10MB",
            "value": 7524385,
            "range": "± 59514",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/50MB",
            "value": 41002925,
            "range": "± 247390",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/2",
            "value": 808,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/10",
            "value": 3376,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/50",
            "value": 15657,
            "range": "± 39",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/100",
            "value": 30643,
            "range": "± 100",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/500",
            "value": 150439,
            "range": "± 371",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/1024",
            "value": 307438,
            "range": "± 9777",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/2",
            "value": 850,
            "range": "± 5",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/10",
            "value": 3713,
            "range": "± 7",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/50",
            "value": 17587,
            "range": "± 58",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/100",
            "value": 35204,
            "range": "± 672",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/500",
            "value": 173805,
            "range": "± 798",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/1024",
            "value": 354887,
            "range": "± 15603",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/1MB",
            "value": 699677,
            "range": "± 2200",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/10MB",
            "value": 7117663,
            "range": "± 93852",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/100MB",
            "value": 110201894,
            "range": "± 137216",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/500MB",
            "value": 558783685,
            "range": "± 1708137",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/1024MB",
            "value": 1150563326,
            "range": "± 10897867",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/10",
            "value": 33871,
            "range": "± 351",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/50",
            "value": 134535,
            "range": "± 685",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/100",
            "value": 266817,
            "range": "± 761",
            "unit": "ns/iter"
          },
          {
            "name": "decay_simulation/10k_posts_60_days",
            "value": 16660368,
            "range": "± 488744",
            "unit": "ns/iter"
          },
          {
            "name": "decay_simulation_large/100k_posts_60_days",
            "value": 207754285,
            "range": "± 2913506",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/1000",
            "value": 25,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/10000",
            "value": 54574,
            "range": "± 395",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/50000",
            "value": 240857,
            "range": "± 3342",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/100",
            "value": 29140,
            "range": "± 44",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/1000",
            "value": 310972,
            "range": "± 285",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/10000",
            "value": 3076490,
            "range": "± 3235",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/100000",
            "value": 29942250,
            "range": "± 350732",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/1000",
            "value": 1613,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/10000",
            "value": 19633,
            "range": "± 21",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/100000",
            "value": 150477,
            "range": "± 299",
            "unit": "ns/iter"
          },
          {
            "name": "header_hash",
            "value": 297,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "meets_difficulty",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Budget_1GB",
            "value": 2250375,
            "range": "± 9207",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Standard_5GB",
            "value": 12567570,
            "range": "± 264809",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Flagship_10GB",
            "value": 25337723,
            "range": "± 633108",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/50",
            "value": 3,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/75",
            "value": 3,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/90",
            "value": 3,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/95",
            "value": 3,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/99",
            "value": 3,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/1KB",
            "value": 747500,
            "range": "± 321954",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/10KB",
            "value": 523740,
            "range": "± 210617",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/100KB",
            "value": 943857,
            "range": "± 410493",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/100",
            "value": 1121,
            "range": "± 5",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/1000",
            "value": 11812,
            "range": "± 54",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/10000",
            "value": 175081,
            "range": "± 4026",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/steady_state",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/daily_growth",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/avg_post_size",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/10_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/100_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/1000_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/10000_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/budget_1gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/standard_5gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/flagship_10gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/root_block",
            "value": 3787,
            "range": "± 533",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/space_block",
            "value": 457,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/content_block",
            "value": 478,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/1024",
            "value": 695296,
            "range": "± 846150",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/4096",
            "value": 1127044,
            "range": "± 1446619",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/65536",
            "value": 1764934,
            "range": "± 1490849",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/1048576",
            "value": 3782228,
            "range": "± 544984",
            "unit": "ns/iter"
          },
          {
            "name": "random_read/root_block_1000",
            "value": 619,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/1024_bytes",
            "value": 8177,
            "range": "± 11",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/65536_bytes",
            "value": 51209,
            "range": "± 213",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/1048576_bytes",
            "value": 674302,
            "range": "± 15164",
            "unit": "ns/iter"
          },
          {
            "name": "cache/add_entry",
            "value": 433,
            "range": "± 5",
            "unit": "ns/iter"
          },
          {
            "name": "cache/access",
            "value": 208,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/100",
            "value": 22441,
            "range": "± 256",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/1000",
            "value": 39272,
            "range": "± 974",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/10000",
            "value": 39307,
            "range": "± 223",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/1048576_bytes",
            "value": 604866,
            "range": "± 4703",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/5242880_bytes",
            "value": 3016161,
            "range": "± 5758",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/10485760_bytes",
            "value": 6092950,
            "range": "± 109156",
            "unit": "ns/iter"
          },
          {
            "name": "startup/empty_db",
            "value": 2506507,
            "range": "± 450626",
            "unit": "ns/iter"
          },
          {
            "name": "startup/populated_db",
            "value": 7280623,
            "range": "± 2792565",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/100",
            "value": 585069,
            "range": "± 78353",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/1000",
            "value": 1137482,
            "range": "± 469351",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/10000",
            "value": 955434,
            "range": "± 441868",
            "unit": "ns/iter"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "admin@adminwizard.tech",
            "name": "AdminWizard"
          },
          "committer": {
            "email": "admin@adminwizard.tech",
            "name": "AdminWizard"
          },
          "distinct": true,
          "id": "37e7ed9e51988f0f25af9b46ae273fdb9af6f877",
          "message": "feat(private-media): node-managed PRVM1 media encrypt/serve + composer wiring\n\nCompletes the private-space media path (crypto + RPC + client), mirroring the\nalready-shipped node-managed text path.\n\nCrypto (private_space.rs): encrypt_media_with_space_key (magic ++ iv||ct+tag)\nand decrypt_media_with_space_key (strip magic, AES-256-GCM) — the binary\nanalogues of the text envelope fns.\n\nRPC (methods.rs):\n- upload_media gains optional space_id. For a private space the node is a member\n  of, it encrypts the bytes to a PRVM1 envelope BEFORE hashing/storing, so the\n  returned media_hash is the ENCRYPTED blob's hash — exactly what the composer\n  mines PoW over and what write-side enforcement re-checks. Blocklist still runs\n  on the plaintext (node sees it at upload). Public spaces store plaintext.\n- get_media trial-decrypts a PRVM1 blob against the keys of every private space\n  the node belongs to (GCM tag authenticates the right key); non-members get an\n  opaque not-found, never the ciphertext. No viewer-side plumbing needed.\n\nClient (feed-client): uploadImage/compressAndUpload/uploadMedia take an optional\nspaceId; Compose passes selectedSpace when node-mode + private, so the encrypt-\nbefore-hash ordering holds (pick the space before adding images).\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>",
          "timestamp": "2026-07-12T00:22:05-04:00",
          "tree_id": "29b2288b5781c5349e5c6a9af7b8333f4e322625",
          "url": "https://github.com/superness/swimchain/commit/37e7ed9e51988f0f25af9b46ae273fdb9af6f877"
        },
        "date": 1783832175988,
        "tool": "cargo",
        "benches": [
          {
            "name": "mobile_single_hash/mobile_64mib_p2",
            "value": 99750830,
            "range": "± 1106862",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_single_hash/desktop_64mib_p4",
            "value": 100569769,
            "range": "± 1128938",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_single_hash/test_1mib_p1",
            "value": 390711,
            "range": "± 653",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/4",
            "value": 548781500,
            "range": "± 978919651",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/6",
            "value": 4698499745,
            "range": "± 7936720308",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/8",
            "value": 14032296518,
            "range": "± 16221468040",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/4",
            "value": 6926750,
            "range": "± 813079",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/6",
            "value": 28556882,
            "range": "± 8463448",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/8",
            "value": 93574519,
            "range": "± 40699685",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/10",
            "value": 305912816,
            "range": "± 214354061",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/12",
            "value": 1174269930,
            "range": "± 1454645448",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Post",
            "value": 2673038670,
            "range": "± 1767944093",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Reply",
            "value": 639054374,
            "range": "± 1343914856",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Engage",
            "value": 1236520248,
            "range": "± 2054285829",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/3G_2mbps",
            "value": 3026917314,
            "range": "± 1340863",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/4G_10mbps",
            "value": 3288,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/WiFi_50mbps",
            "value": 3420,
            "range": "± 6",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/1KB",
            "value": 5181,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/4KB",
            "value": 1348,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/16KB",
            "value": 403,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/64KB",
            "value": 141,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "node_startup",
            "value": 2534897920,
            "range": "± 73707781",
            "unit": "ns/iter"
          },
          {
            "name": "node_shutdown",
            "value": 2356857787,
            "range": "± 4032399",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/2",
            "value": 4822138204,
            "range": "± 49132263",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/3",
            "value": 7290579470,
            "range": "± 177233977",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/5",
            "value": 12102071512,
            "range": "± 118380186",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/10",
            "value": 24097119427,
            "range": "± 278181985",
            "unit": "ns/iter"
          },
          {
            "name": "chain_store_access",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "connection_manager_access",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_info",
            "value": 144316,
            "range": "± 2847",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_sync_status",
            "value": 704736,
            "range": "± 6527",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_chain_stats",
            "value": 147712,
            "range": "± 4483",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_peers",
            "value": 136301,
            "range": "± 2409",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/list_spaces",
            "value": 137885,
            "range": "± 1693",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/feed_poll",
            "value": 996028,
            "range": "± 15617",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/create_space",
            "value": 7508822,
            "range": "± 1359724",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/submit_post",
            "value": 16828746,
            "range": "± 2313186",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/list_space_content_populated",
            "value": 4853583,
            "range": "± 16932",
            "unit": "ns/iter"
          },
          {
            "name": "keypair_generation",
            "value": 18759,
            "range": "± 77",
            "unit": "ns/iter"
          },
          {
            "name": "sign_32bytes",
            "value": 37151,
            "range": "± 146",
            "unit": "ns/iter"
          },
          {
            "name": "sign_1kb",
            "value": 41305,
            "range": "± 314",
            "unit": "ns/iter"
          },
          {
            "name": "verify_signature",
            "value": 39453,
            "range": "± 26",
            "unit": "ns/iter"
          },
          {
            "name": "encode_address",
            "value": 336,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "decode_address",
            "value": 496,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/8",
            "value": 37643,
            "range": "± 301",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/12",
            "value": 307937,
            "range": "± 8082",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/16",
            "value": 4797649,
            "range": "± 764972",
            "unit": "ns/iter"
          },
          {
            "name": "encrypt_private_key",
            "value": 103693237,
            "range": "± 2211981",
            "unit": "ns/iter"
          },
          {
            "name": "decrypt_private_key",
            "value": 99683247,
            "range": "± 2511377",
            "unit": "ns/iter"
          },
          {
            "name": "export_identity",
            "value": 101958301,
            "range": "± 2715473",
            "unit": "ns/iter"
          },
          {
            "name": "import_identity",
            "value": 103285810,
            "range": "± 6929415",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_1mib",
            "value": 393288,
            "range": "± 2110",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/4",
            "value": 6158864,
            "range": "± 948478",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/8",
            "value": 80778852,
            "range": "± 45848262",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/10",
            "value": 323065673,
            "range": "± 272838433",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/12",
            "value": 1818665745,
            "range": "± 973310259",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_64mib",
            "value": 107922157,
            "range": "± 3069734",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_mobile",
            "value": 104379648,
            "range": "± 2043659",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/test_1mib",
            "value": 394985,
            "range": "± 732",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/mobile_64mib_p2",
            "value": 104315236,
            "range": "± 2716185",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/prod_64mib_p4",
            "value": 108445186,
            "range": "± 4006316",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/100",
            "value": 2394001,
            "range": "± 103798",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/500",
            "value": 8093142,
            "range": "± 5949043",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/1000",
            "value": 13651404,
            "range": "± 1100418",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/100",
            "value": 235,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/1000",
            "value": 251,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/5000",
            "value": 324,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "insert_with_branch/insert_default_threshold",
            "value": 25932,
            "range": "± 2326",
            "unit": "ns/iter"
          },
          {
            "name": "insert_with_branch/insert_small_threshold",
            "value": 121479,
            "range": "± 22516",
            "unit": "ns/iter"
          },
          {
            "name": "space_state_lookup/get_space_branch_state",
            "value": 232,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "hash_branch_matching/assign_branch_unfractured",
            "value": 211,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "hash_branch_matching/assign_branch_fractured",
            "value": 256,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/2MB",
            "value": 1401964,
            "range": "± 2772",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/10MB",
            "value": 11521533,
            "range": "± 82037",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/50MB",
            "value": 60994675,
            "range": "± 498297",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/100MB",
            "value": 119702130,
            "range": "± 818533",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/2MB",
            "value": 2801757,
            "range": "± 24440",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/10MB",
            "value": 13983725,
            "range": "± 150104",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/50MB",
            "value": 94765845,
            "range": "± 1061443",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/2MB",
            "value": 1511818,
            "range": "± 3105",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/10MB",
            "value": 8364403,
            "range": "± 89048",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/50MB",
            "value": 42026685,
            "range": "± 543362",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/2",
            "value": 799,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/10",
            "value": 3412,
            "range": "± 35",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/50",
            "value": 15887,
            "range": "± 54",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/100",
            "value": 30954,
            "range": "± 147",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/500",
            "value": 151648,
            "range": "± 726",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/1024",
            "value": 309237,
            "range": "± 1850",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/2",
            "value": 867,
            "range": "± 6",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/10",
            "value": 3827,
            "range": "± 27",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/50",
            "value": 17872,
            "range": "± 49",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/100",
            "value": 35031,
            "range": "± 31",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/500",
            "value": 176925,
            "range": "± 1081",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/1024",
            "value": 363288,
            "range": "± 2485",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/1MB",
            "value": 702411,
            "range": "± 964",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/10MB",
            "value": 7134761,
            "range": "± 95045",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/100MB",
            "value": 118437934,
            "range": "± 1118815",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/500MB",
            "value": 585136922,
            "range": "± 5315100",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/1024MB",
            "value": 1206954439,
            "range": "± 4627542",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/10",
            "value": 34756,
            "range": "± 187",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/50",
            "value": 140417,
            "range": "± 490",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/100",
            "value": 268458,
            "range": "± 4102",
            "unit": "ns/iter"
          },
          {
            "name": "decay_simulation/10k_posts_60_days",
            "value": 18743150,
            "range": "± 1753850",
            "unit": "ns/iter"
          },
          {
            "name": "decay_simulation_large/100k_posts_60_days",
            "value": 266851314,
            "range": "± 5947866",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/1000",
            "value": 26,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/10000",
            "value": 53446,
            "range": "± 549",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/50000",
            "value": 252218,
            "range": "± 6872",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/100",
            "value": 30173,
            "range": "± 277",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/1000",
            "value": 311977,
            "range": "± 2428",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/10000",
            "value": 3139158,
            "range": "± 17470",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/100000",
            "value": 31193302,
            "range": "± 155650",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/1000",
            "value": 1741,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/10000",
            "value": 19582,
            "range": "± 2740",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/100000",
            "value": 150911,
            "range": "± 2674",
            "unit": "ns/iter"
          },
          {
            "name": "header_hash",
            "value": 320,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "meets_difficulty",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Budget_1GB",
            "value": 2957219,
            "range": "± 19318",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Standard_5GB",
            "value": 15538936,
            "range": "± 87243",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Flagship_10GB",
            "value": 31292937,
            "range": "± 366776",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/50",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/75",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/90",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/95",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/99",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/1KB",
            "value": 400109,
            "range": "± 27559",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/10KB",
            "value": 436635,
            "range": "± 14553",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/100KB",
            "value": 628257,
            "range": "± 20063",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/100",
            "value": 1382,
            "range": "± 7",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/1000",
            "value": 16744,
            "range": "± 494",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/10000",
            "value": 210087,
            "range": "± 2412",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/steady_state",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/daily_growth",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/avg_post_size",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/10_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/100_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/1000_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/10000_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/budget_1gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/standard_5gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/flagship_10gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/root_block",
            "value": 4776,
            "range": "± 367",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/space_block",
            "value": 626,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/content_block",
            "value": 624,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/1024",
            "value": 9074,
            "range": "± 8345",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/4096",
            "value": 14940,
            "range": "± 10745",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/65536",
            "value": 147889,
            "range": "± 70524",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/1048576",
            "value": 2125127,
            "range": "± 139463",
            "unit": "ns/iter"
          },
          {
            "name": "random_read/root_block_1000",
            "value": 726,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/1024_bytes",
            "value": 8374,
            "range": "± 14",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/65536_bytes",
            "value": 51319,
            "range": "± 68",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/1048576_bytes",
            "value": 726768,
            "range": "± 925",
            "unit": "ns/iter"
          },
          {
            "name": "cache/add_entry",
            "value": 574,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "cache/access",
            "value": 277,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/100",
            "value": 28690,
            "range": "± 131",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/1000",
            "value": 52886,
            "range": "± 144",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/10000",
            "value": 53154,
            "range": "± 268",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/1048576_bytes",
            "value": 700569,
            "range": "± 696",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/5242880_bytes",
            "value": 3504898,
            "range": "± 9630",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/10485760_bytes",
            "value": 7017777,
            "range": "± 8242",
            "unit": "ns/iter"
          },
          {
            "name": "startup/empty_db",
            "value": 2227673,
            "range": "± 57146",
            "unit": "ns/iter"
          },
          {
            "name": "startup/populated_db",
            "value": 6076738,
            "range": "± 65545",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/100",
            "value": 486572,
            "range": "± 6078",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/1000",
            "value": 608498,
            "range": "± 3440",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/10000",
            "value": 607843,
            "range": "± 10636",
            "unit": "ns/iter"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "admin@adminwizard.tech",
            "name": "AdminWizard"
          },
          "committer": {
            "email": "admin@adminwizard.tech",
            "name": "AdminWizard"
          },
          "distinct": true,
          "id": "61af3feb0cf41b4279fb800f4ebd202cdff305d2",
          "message": "chore: reconcile in-flight WIP (builder, private_space, mobile lock, frontend dist)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>",
          "timestamp": "2026-07-12T11:33:21-04:00",
          "tree_id": "8395b8cc36a678e1bedc5ef116445beef389f45b",
          "url": "https://github.com/superness/swimchain/commit/61af3feb0cf41b4279fb800f4ebd202cdff305d2"
        },
        "date": 1783871829004,
        "tool": "cargo",
        "benches": [
          {
            "name": "mobile_single_hash/mobile_64mib_p2",
            "value": 89645985,
            "range": "± 910210",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_single_hash/desktop_64mib_p4",
            "value": 92482685,
            "range": "± 724315",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_single_hash/test_1mib_p1",
            "value": 401915,
            "range": "± 428",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/4",
            "value": 1474699191,
            "range": "± 1707854175",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/6",
            "value": 5393268893,
            "range": "± 5529674979",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/8",
            "value": 15343208183,
            "range": "± 11180761865",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/4",
            "value": 5852242,
            "range": "± 1122562",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/6",
            "value": 24569156,
            "range": "± 7821696",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/8",
            "value": 94434805,
            "range": "± 95906046",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/10",
            "value": 229211056,
            "range": "± 173328851",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/12",
            "value": 2253624042,
            "range": "± 1222949604",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Post",
            "value": 1068026916,
            "range": "± 1264112310",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Reply",
            "value": 1695556966,
            "range": "± 1212526686",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Engage",
            "value": 627202107,
            "range": "± 982032211",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/3G_2mbps",
            "value": 3039095627,
            "range": "± 1905321",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/4G_10mbps",
            "value": 2985,
            "range": "± 20",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/WiFi_50mbps",
            "value": 2990,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/1KB",
            "value": 4719,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/4KB",
            "value": 1218,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/16KB",
            "value": 364,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/64KB",
            "value": 127,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "node_startup",
            "value": 2435527693,
            "range": "± 106959923",
            "unit": "ns/iter"
          },
          {
            "name": "node_shutdown",
            "value": 2358659494,
            "range": "± 2941073",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/2",
            "value": 4807094920,
            "range": "± 28747624",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/3",
            "value": 7202613102,
            "range": "± 23862595",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/5",
            "value": 12037899051,
            "range": "± 142841528",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/10",
            "value": 24072986271,
            "range": "± 368283344",
            "unit": "ns/iter"
          },
          {
            "name": "chain_store_access",
            "value": 3,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "connection_manager_access",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_info",
            "value": 168657,
            "range": "± 2050",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_sync_status",
            "value": 652534,
            "range": "± 3557",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_chain_stats",
            "value": 168590,
            "range": "± 2050",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_peers",
            "value": 160706,
            "range": "± 3157",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/list_spaces",
            "value": 162479,
            "range": "± 2130",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/feed_poll",
            "value": 993134,
            "range": "± 9709",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/create_space",
            "value": 7724160,
            "range": "± 1064261",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/submit_post",
            "value": 18820810,
            "range": "± 1562717",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/list_space_content_populated",
            "value": 4447701,
            "range": "± 21786",
            "unit": "ns/iter"
          },
          {
            "name": "keypair_generation",
            "value": 19497,
            "range": "± 109",
            "unit": "ns/iter"
          },
          {
            "name": "sign_32bytes",
            "value": 37074,
            "range": "± 19",
            "unit": "ns/iter"
          },
          {
            "name": "sign_1kb",
            "value": 41240,
            "range": "± 325",
            "unit": "ns/iter"
          },
          {
            "name": "verify_signature",
            "value": 44613,
            "range": "± 26",
            "unit": "ns/iter"
          },
          {
            "name": "encode_address",
            "value": 332,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decode_address",
            "value": 482,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/8",
            "value": 37249,
            "range": "± 434",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/12",
            "value": 313850,
            "range": "± 8811",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/16",
            "value": 5202589,
            "range": "± 1156913",
            "unit": "ns/iter"
          },
          {
            "name": "encrypt_private_key",
            "value": 91954307,
            "range": "± 943429",
            "unit": "ns/iter"
          },
          {
            "name": "decrypt_private_key",
            "value": 92532650,
            "range": "± 1096853",
            "unit": "ns/iter"
          },
          {
            "name": "export_identity",
            "value": 91154823,
            "range": "± 845874",
            "unit": "ns/iter"
          },
          {
            "name": "import_identity",
            "value": 92000645,
            "range": "± 1112378",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_1mib",
            "value": 392205,
            "range": "± 845",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/4",
            "value": 6146386,
            "range": "± 834295",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/8",
            "value": 97642267,
            "range": "± 60412108",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/10",
            "value": 387235143,
            "range": "± 394067839",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/12",
            "value": 1047266633,
            "range": "± 2189795256",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_64mib",
            "value": 94776725,
            "range": "± 655227",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_mobile",
            "value": 92362027,
            "range": "± 548147",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/test_1mib",
            "value": 392660,
            "range": "± 1088",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/mobile_64mib_p2",
            "value": 93507260,
            "range": "± 879738",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/prod_64mib_p4",
            "value": 93682216,
            "range": "± 911210",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/100",
            "value": 1693526,
            "range": "± 66560",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/500",
            "value": 5492729,
            "range": "± 477032",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/1000",
            "value": 10614002,
            "range": "± 193611",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/100",
            "value": 234,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/1000",
            "value": 246,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/5000",
            "value": 316,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "insert_with_branch/insert_default_threshold",
            "value": 22986,
            "range": "± 1589",
            "unit": "ns/iter"
          },
          {
            "name": "insert_with_branch/insert_small_threshold",
            "value": 97268,
            "range": "± 12474",
            "unit": "ns/iter"
          },
          {
            "name": "space_state_lookup/get_space_branch_state",
            "value": 230,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "hash_branch_matching/assign_branch_unfractured",
            "value": 211,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "hash_branch_matching/assign_branch_fractured",
            "value": 251,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/2MB",
            "value": 1396256,
            "range": "± 2933",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/10MB",
            "value": 11184561,
            "range": "± 94831",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/50MB",
            "value": 56421681,
            "range": "± 128433",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/100MB",
            "value": 113235511,
            "range": "± 245838",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/2MB",
            "value": 2748731,
            "range": "± 22778",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/10MB",
            "value": 13913474,
            "range": "± 165644",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/50MB",
            "value": 90372213,
            "range": "± 2060430",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/2MB",
            "value": 1510007,
            "range": "± 3759",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/10MB",
            "value": 7601736,
            "range": "± 37957",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/50MB",
            "value": 40891819,
            "range": "± 275714",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/2",
            "value": 835,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/10",
            "value": 3379,
            "range": "± 10",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/50",
            "value": 15562,
            "range": "± 29",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/100",
            "value": 30771,
            "range": "± 89",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/500",
            "value": 150144,
            "range": "± 251",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/1024",
            "value": 306124,
            "range": "± 952",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/2",
            "value": 842,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/10",
            "value": 3698,
            "range": "± 7",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/50",
            "value": 17724,
            "range": "± 39",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/100",
            "value": 34647,
            "range": "± 87",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/500",
            "value": 171630,
            "range": "± 592",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/1024",
            "value": 349072,
            "range": "± 473",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/1MB",
            "value": 699764,
            "range": "± 675",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/10MB",
            "value": 7195224,
            "range": "± 58047",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/100MB",
            "value": 110291230,
            "range": "± 300703",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/500MB",
            "value": 560449962,
            "range": "± 2231599",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/1024MB",
            "value": 1153207956,
            "range": "± 2260329",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/10",
            "value": 33847,
            "range": "± 84",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/50",
            "value": 133052,
            "range": "± 341",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/100",
            "value": 256232,
            "range": "± 591",
            "unit": "ns/iter"
          },
          {
            "name": "decay_simulation/10k_posts_60_days",
            "value": 18318818,
            "range": "± 1260929",
            "unit": "ns/iter"
          },
          {
            "name": "decay_simulation_large/100k_posts_60_days",
            "value": 212576131,
            "range": "± 1956574",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/1000",
            "value": 25,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/10000",
            "value": 53543,
            "range": "± 417",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/50000",
            "value": 243593,
            "range": "± 1850",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/100",
            "value": 28983,
            "range": "± 50",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/1000",
            "value": 316729,
            "range": "± 773",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/10000",
            "value": 2993924,
            "range": "± 4421",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/100000",
            "value": 31136024,
            "range": "± 24044",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/1000",
            "value": 1603,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/10000",
            "value": 26197,
            "range": "± 75",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/100000",
            "value": 199115,
            "range": "± 494",
            "unit": "ns/iter"
          },
          {
            "name": "header_hash",
            "value": 297,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "meets_difficulty",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Budget_1GB",
            "value": 2975415,
            "range": "± 29116",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Standard_5GB",
            "value": 16402158,
            "range": "± 350507",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Flagship_10GB",
            "value": 35495701,
            "range": "± 692065",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/50",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/75",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/90",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/95",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/99",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/1KB",
            "value": 441183,
            "range": "± 19662",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/10KB",
            "value": 490431,
            "range": "± 35291",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/100KB",
            "value": 676816,
            "range": "± 38103",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/100",
            "value": 1404,
            "range": "± 6",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/1000",
            "value": 15664,
            "range": "± 1370",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/10000",
            "value": 216446,
            "range": "± 2820",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/steady_state",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/daily_growth",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/avg_post_size",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/10_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/100_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/1000_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/10000_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/budget_1gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/standard_5gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/flagship_10gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/root_block",
            "value": 5000,
            "range": "± 515",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/space_block",
            "value": 633,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/content_block",
            "value": 609,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/1024",
            "value": 9569,
            "range": "± 9250",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/4096",
            "value": 19281,
            "range": "± 17763",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/65536",
            "value": 156346,
            "range": "± 71697",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/1048576",
            "value": 2176034,
            "range": "± 99996",
            "unit": "ns/iter"
          },
          {
            "name": "random_read/root_block_1000",
            "value": 698,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/1024_bytes",
            "value": 8532,
            "range": "± 12",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/65536_bytes",
            "value": 52026,
            "range": "± 147",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/1048576_bytes",
            "value": 731599,
            "range": "± 1044",
            "unit": "ns/iter"
          },
          {
            "name": "cache/add_entry",
            "value": 579,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "cache/access",
            "value": 284,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/100",
            "value": 28768,
            "range": "± 109",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/1000",
            "value": 53566,
            "range": "± 813",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/10000",
            "value": 53452,
            "range": "± 503",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/1048576_bytes",
            "value": 704944,
            "range": "± 1289",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/5242880_bytes",
            "value": 3517249,
            "range": "± 3613",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/10485760_bytes",
            "value": 7105586,
            "range": "± 22583",
            "unit": "ns/iter"
          },
          {
            "name": "startup/empty_db",
            "value": 2377361,
            "range": "± 59338",
            "unit": "ns/iter"
          },
          {
            "name": "startup/populated_db",
            "value": 6507940,
            "range": "± 93643",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/100",
            "value": 520520,
            "range": "± 28486",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/1000",
            "value": 621503,
            "range": "± 16826",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/10000",
            "value": 632239,
            "range": "± 10813",
            "unit": "ns/iter"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "admin@adminwizard.tech",
            "name": "AdminWizard"
          },
          "committer": {
            "email": "admin@adminwizard.tech",
            "name": "AdminWizard"
          },
          "distinct": true,
          "id": "65d45be3a7fd25ef1471d68e57addc9b4bdc7153",
          "message": "feat(testnet): bump testnet magic TEST->TES2 (space-class hard-fork isolation)\n\nIsolates the space-class testnet from old-binary nodes still serving the\npre-class chain, so a wiped droplet can't reorg back onto the old height-26\nchain. Requires all testnet participants (droplets, mobile, PC) to rebuild.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>",
          "timestamp": "2026-07-12T11:55:19-04:00",
          "tree_id": "3f9c71d7f3498252243097ae80950103a1fb74e2",
          "url": "https://github.com/superness/swimchain/commit/65d45be3a7fd25ef1471d68e57addc9b4bdc7153"
        },
        "date": 1783873344609,
        "tool": "cargo",
        "benches": [
          {
            "name": "mobile_single_hash/mobile_64mib_p2",
            "value": 90719493,
            "range": "± 673446",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_single_hash/desktop_64mib_p4",
            "value": 92449765,
            "range": "± 1606551",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_single_hash/test_1mib_p1",
            "value": 403656,
            "range": "± 1963",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/4",
            "value": 1831976610,
            "range": "± 1750765470",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/6",
            "value": 4148050906,
            "range": "± 8294001546",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/8",
            "value": 16004739725,
            "range": "± 11193325818",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/4",
            "value": 6680883,
            "range": "± 1354076",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/6",
            "value": 27882010,
            "range": "± 8072941",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/8",
            "value": 90670103,
            "range": "± 59300394",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/10",
            "value": 514337925,
            "range": "± 436210884",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/12",
            "value": 1343971282,
            "range": "± 2279088935",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Post",
            "value": 1234193307,
            "range": "± 1915104558",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Reply",
            "value": 2175146803,
            "range": "± 2109290189",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Engage",
            "value": 1237733600,
            "range": "± 1110636383",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/3G_2mbps",
            "value": 3038753239,
            "range": "± 1414732",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/4G_10mbps",
            "value": 2985,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/WiFi_50mbps",
            "value": 2989,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/1KB",
            "value": 4716,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/4KB",
            "value": 1218,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/16KB",
            "value": 364,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/64KB",
            "value": 127,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "node_startup",
            "value": 2552889548,
            "range": "± 121464581",
            "unit": "ns/iter"
          },
          {
            "name": "node_shutdown",
            "value": 2361451467,
            "range": "± 3323227",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/2",
            "value": 4877889524,
            "range": "± 70669926",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/3",
            "value": 7303609218,
            "range": "± 72041707",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/5",
            "value": 12157247254,
            "range": "± 339266516",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/10",
            "value": 24413330197,
            "range": "± 394396617",
            "unit": "ns/iter"
          },
          {
            "name": "chain_store_access",
            "value": 3,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "connection_manager_access",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_info",
            "value": 165508,
            "range": "± 2350",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_sync_status",
            "value": 638732,
            "range": "± 2254",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_chain_stats",
            "value": 166577,
            "range": "± 1545",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_peers",
            "value": 160305,
            "range": "± 1053",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/list_spaces",
            "value": 161780,
            "range": "± 578",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/feed_poll",
            "value": 974115,
            "range": "± 6254",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/create_space",
            "value": 7732779,
            "range": "± 977100",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/submit_post",
            "value": 20090046,
            "range": "± 1167902",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/list_space_content_populated",
            "value": 3996829,
            "range": "± 9213",
            "unit": "ns/iter"
          },
          {
            "name": "keypair_generation",
            "value": 18680,
            "range": "± 58",
            "unit": "ns/iter"
          },
          {
            "name": "sign_32bytes",
            "value": 36990,
            "range": "± 32",
            "unit": "ns/iter"
          },
          {
            "name": "sign_1kb",
            "value": 41152,
            "range": "± 64",
            "unit": "ns/iter"
          },
          {
            "name": "verify_signature",
            "value": 40301,
            "range": "± 45",
            "unit": "ns/iter"
          },
          {
            "name": "encode_address",
            "value": 333,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decode_address",
            "value": 483,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/8",
            "value": 37134,
            "range": "± 238",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/12",
            "value": 319689,
            "range": "± 8772",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/16",
            "value": 4793589,
            "range": "± 696462",
            "unit": "ns/iter"
          },
          {
            "name": "encrypt_private_key",
            "value": 87831381,
            "range": "± 931923",
            "unit": "ns/iter"
          },
          {
            "name": "decrypt_private_key",
            "value": 89981962,
            "range": "± 1082174",
            "unit": "ns/iter"
          },
          {
            "name": "export_identity",
            "value": 88285737,
            "range": "± 418369",
            "unit": "ns/iter"
          },
          {
            "name": "import_identity",
            "value": 87949355,
            "range": "± 1116177",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_1mib",
            "value": 392746,
            "range": "± 991",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/4",
            "value": 7087693,
            "range": "± 1414353",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/8",
            "value": 94741551,
            "range": "± 51053023",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/10",
            "value": 312024870,
            "range": "± 306345132",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/12",
            "value": 824078122,
            "range": "± 555978367",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_64mib",
            "value": 91561564,
            "range": "± 926864",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_mobile",
            "value": 91498331,
            "range": "± 926828",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/test_1mib",
            "value": 392339,
            "range": "± 7171",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/mobile_64mib_p2",
            "value": 90346035,
            "range": "± 870607",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/prod_64mib_p4",
            "value": 92184061,
            "range": "± 523449",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/100",
            "value": 1820499,
            "range": "± 68468",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/500",
            "value": 5642051,
            "range": "± 124406",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/1000",
            "value": 10724498,
            "range": "± 65670",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/100",
            "value": 234,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/1000",
            "value": 247,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/5000",
            "value": 317,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "insert_with_branch/insert_default_threshold",
            "value": 22796,
            "range": "± 1568",
            "unit": "ns/iter"
          },
          {
            "name": "insert_with_branch/insert_small_threshold",
            "value": 97687,
            "range": "± 12464",
            "unit": "ns/iter"
          },
          {
            "name": "space_state_lookup/get_space_branch_state",
            "value": 235,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "hash_branch_matching/assign_branch_unfractured",
            "value": 210,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "hash_branch_matching/assign_branch_fractured",
            "value": 257,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/2MB",
            "value": 1398015,
            "range": "± 2175",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/10MB",
            "value": 11148592,
            "range": "± 79802",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/50MB",
            "value": 56543541,
            "range": "± 107993",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/100MB",
            "value": 113230664,
            "range": "± 160853",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/2MB",
            "value": 2747581,
            "range": "± 24912",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/10MB",
            "value": 13759896,
            "range": "± 153843",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/50MB",
            "value": 91732613,
            "range": "± 1035734",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/2MB",
            "value": 1496954,
            "range": "± 8198",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/10MB",
            "value": 7516609,
            "range": "± 87252",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/50MB",
            "value": 41129177,
            "range": "± 331561",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/2",
            "value": 786,
            "range": "± 12",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/10",
            "value": 3394,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/50",
            "value": 15694,
            "range": "± 88",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/100",
            "value": 30747,
            "range": "± 158",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/500",
            "value": 150917,
            "range": "± 182",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/1024",
            "value": 310026,
            "range": "± 302",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/2",
            "value": 843,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/10",
            "value": 3700,
            "range": "± 9",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/50",
            "value": 17886,
            "range": "± 167",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/100",
            "value": 34830,
            "range": "± 174",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/500",
            "value": 170966,
            "range": "± 537",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/1024",
            "value": 349902,
            "range": "± 2846",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/1MB",
            "value": 702394,
            "range": "± 3440",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/10MB",
            "value": 7191193,
            "range": "± 80103",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/100MB",
            "value": 110291443,
            "range": "± 237941",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/500MB",
            "value": 560637854,
            "range": "± 3312620",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/1024MB",
            "value": 1155655018,
            "range": "± 1635958",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/10",
            "value": 34234,
            "range": "± 205",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/50",
            "value": 135103,
            "range": "± 413",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/100",
            "value": 267679,
            "range": "± 490",
            "unit": "ns/iter"
          },
          {
            "name": "decay_simulation/10k_posts_60_days",
            "value": 18914801,
            "range": "± 963478",
            "unit": "ns/iter"
          },
          {
            "name": "decay_simulation_large/100k_posts_60_days",
            "value": 207697693,
            "range": "± 3493072",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/1000",
            "value": 25,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/10000",
            "value": 53374,
            "range": "± 845",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/50000",
            "value": 242590,
            "range": "± 2818",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/100",
            "value": 28998,
            "range": "± 36",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/1000",
            "value": 300805,
            "range": "± 223",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/10000",
            "value": 3002445,
            "range": "± 21948",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/100000",
            "value": 30836135,
            "range": "± 37091",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/1000",
            "value": 1634,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/10000",
            "value": 22252,
            "range": "± 3613",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/100000",
            "value": 213103,
            "range": "± 635",
            "unit": "ns/iter"
          },
          {
            "name": "header_hash",
            "value": 319,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "meets_difficulty",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Budget_1GB",
            "value": 2952223,
            "range": "± 19564",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Standard_5GB",
            "value": 15548588,
            "range": "± 96114",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Flagship_10GB",
            "value": 32090128,
            "range": "± 683113",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/50",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/75",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/90",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/95",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/99",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/1KB",
            "value": 478270,
            "range": "± 28453",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/10KB",
            "value": 488092,
            "range": "± 21441",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/100KB",
            "value": 710299,
            "range": "± 43506",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/100",
            "value": 1377,
            "range": "± 12",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/1000",
            "value": 16502,
            "range": "± 553",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/10000",
            "value": 215155,
            "range": "± 3984",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/steady_state",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/daily_growth",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/avg_post_size",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/10_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/100_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/1000_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/10000_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/budget_1gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/standard_5gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/flagship_10gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/root_block",
            "value": 4758,
            "range": "± 403",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/space_block",
            "value": 640,
            "range": "± 5",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/content_block",
            "value": 620,
            "range": "± 10",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/1024",
            "value": 10008,
            "range": "± 10010",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/4096",
            "value": 20202,
            "range": "± 19060",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/65536",
            "value": 160694,
            "range": "± 84098",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/1048576",
            "value": 2212116,
            "range": "± 105618",
            "unit": "ns/iter"
          },
          {
            "name": "random_read/root_block_1000",
            "value": 714,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/1024_bytes",
            "value": 8558,
            "range": "± 10",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/65536_bytes",
            "value": 51636,
            "range": "± 73",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/1048576_bytes",
            "value": 729089,
            "range": "± 2283",
            "unit": "ns/iter"
          },
          {
            "name": "cache/add_entry",
            "value": 603,
            "range": "± 6",
            "unit": "ns/iter"
          },
          {
            "name": "cache/access",
            "value": 284,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/100",
            "value": 30068,
            "range": "± 104",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/1000",
            "value": 56042,
            "range": "± 237",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/10000",
            "value": 56478,
            "range": "± 332",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/1048576_bytes",
            "value": 700101,
            "range": "± 1019",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/5242880_bytes",
            "value": 3508258,
            "range": "± 4951",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/10485760_bytes",
            "value": 7022424,
            "range": "± 16425",
            "unit": "ns/iter"
          },
          {
            "name": "startup/empty_db",
            "value": 2379988,
            "range": "± 61493",
            "unit": "ns/iter"
          },
          {
            "name": "startup/populated_db",
            "value": 6318148,
            "range": "± 67820",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/100",
            "value": 580161,
            "range": "± 18669",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/1000",
            "value": 664278,
            "range": "± 11121",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/10000",
            "value": 686177,
            "range": "± 48664",
            "unit": "ns/iter"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "admin@adminwizard.tech",
            "name": "AdminWizard"
          },
          "committer": {
            "email": "admin@adminwizard.tech",
            "name": "AdminWizard"
          },
          "distinct": true,
          "id": "6cf4798e872d86633f9827d1b280ad3b02a22118",
          "message": "fix(cli): sign engagement with the message the node verifies\n\nThe `sw post engage` command signed sign_content(content_hash || timestamp),\nbut the node's submit_engagement (C-ENGAGE-1) verifies an Ed25519 signature\nover the ASCII string \"engage:{content_id}:{pow_nonce}:{timestamp}[:emoji]\"\n— the same format the JS clients use. The CLI was never updated, so every\nCLI-driven engagement failed with \"engagement signature verification failed\".\n\nSign the exact message the node expects. Post/reply signing (sign_content)\nis unchanged.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>",
          "timestamp": "2026-07-12T12:40:30-04:00",
          "tree_id": "ed35280b94fb17a53b4be938cf5b40eec21a5951",
          "url": "https://github.com/superness/swimchain/commit/6cf4798e872d86633f9827d1b280ad3b02a22118"
        },
        "date": 1783875998464,
        "tool": "cargo",
        "benches": [
          {
            "name": "mobile_single_hash/mobile_64mib_p2",
            "value": 90607505,
            "range": "± 931289",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_single_hash/desktop_64mib_p4",
            "value": 92915712,
            "range": "± 654322",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_single_hash/test_1mib_p1",
            "value": 402897,
            "range": "± 1409",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/4",
            "value": 1425559327,
            "range": "± 1507152539",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/6",
            "value": 2775778394,
            "range": "± 5049771898",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/8",
            "value": 18172030391,
            "range": "± 32986227167",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/4",
            "value": 5741213,
            "range": "± 769322",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/6",
            "value": 26677435,
            "range": "± 6799413",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/8",
            "value": 76270286,
            "range": "± 27650128",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/10",
            "value": 417411118,
            "range": "± 334910057",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/12",
            "value": 886415355,
            "range": "± 1149003090",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Post",
            "value": 827279453,
            "range": "± 1182374885",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Reply",
            "value": 1132099120,
            "range": "± 1083148691",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Engage",
            "value": 660260363,
            "range": "± 845683682",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/3G_2mbps",
            "value": 3036301597,
            "range": "± 2114733",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/4G_10mbps",
            "value": 2983,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/WiFi_50mbps",
            "value": 2988,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/1KB",
            "value": 4716,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/4KB",
            "value": 1217,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/16KB",
            "value": 364,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/64KB",
            "value": 127,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "node_startup",
            "value": 2492165381,
            "range": "± 101039055",
            "unit": "ns/iter"
          },
          {
            "name": "node_shutdown",
            "value": 2358182438,
            "range": "± 1604391",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/2",
            "value": 4817771982,
            "range": "± 79315078",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/3",
            "value": 7319832424,
            "range": "± 58527152",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/5",
            "value": 12145520349,
            "range": "± 329663681",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/10",
            "value": 24427049254,
            "range": "± 349662692",
            "unit": "ns/iter"
          },
          {
            "name": "chain_store_access",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "connection_manager_access",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_info",
            "value": 158576,
            "range": "± 2011",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_sync_status",
            "value": 629905,
            "range": "± 4408",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_chain_stats",
            "value": 156481,
            "range": "± 3729",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_peers",
            "value": 151934,
            "range": "± 2765",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/list_spaces",
            "value": 152534,
            "range": "± 9947",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/feed_poll",
            "value": 951718,
            "range": "± 15011",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/create_space",
            "value": 7405779,
            "range": "± 603465",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/submit_post",
            "value": 22728972,
            "range": "± 2386683",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/list_space_content_populated",
            "value": 4354340,
            "range": "± 18441",
            "unit": "ns/iter"
          },
          {
            "name": "keypair_generation",
            "value": 20928,
            "range": "± 28",
            "unit": "ns/iter"
          },
          {
            "name": "sign_32bytes",
            "value": 41176,
            "range": "± 33",
            "unit": "ns/iter"
          },
          {
            "name": "sign_1kb",
            "value": 45685,
            "range": "± 19",
            "unit": "ns/iter"
          },
          {
            "name": "verify_signature",
            "value": 42079,
            "range": "± 38",
            "unit": "ns/iter"
          },
          {
            "name": "encode_address",
            "value": 361,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decode_address",
            "value": 530,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/8",
            "value": 40576,
            "range": "± 239",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/12",
            "value": 331483,
            "range": "± 20063",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/16",
            "value": 5104587,
            "range": "± 807827",
            "unit": "ns/iter"
          },
          {
            "name": "encrypt_private_key",
            "value": 92753934,
            "range": "± 1197426",
            "unit": "ns/iter"
          },
          {
            "name": "decrypt_private_key",
            "value": 92615538,
            "range": "± 535230",
            "unit": "ns/iter"
          },
          {
            "name": "export_identity",
            "value": 92600347,
            "range": "± 139835",
            "unit": "ns/iter"
          },
          {
            "name": "import_identity",
            "value": 92515881,
            "range": "± 956250",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_1mib",
            "value": 391371,
            "range": "± 234",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/4",
            "value": 6108840,
            "range": "± 681004",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/8",
            "value": 99679000,
            "range": "± 50517749",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/10",
            "value": 475962679,
            "range": "± 556312901",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/12",
            "value": 545128382,
            "range": "± 2109238301",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_64mib",
            "value": 97174162,
            "range": "± 1152693",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_mobile",
            "value": 99224017,
            "range": "± 3010697",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/test_1mib",
            "value": 391441,
            "range": "± 652",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/mobile_64mib_p2",
            "value": 96240762,
            "range": "± 1437850",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/prod_64mib_p4",
            "value": 98074892,
            "range": "± 1921985",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/100",
            "value": 1631715,
            "range": "± 9604",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/500",
            "value": 5573527,
            "range": "± 43641",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/1000",
            "value": 11046256,
            "range": "± 72613",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/100",
            "value": 255,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/1000",
            "value": 263,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/5000",
            "value": 346,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "insert_with_branch/insert_default_threshold",
            "value": 23101,
            "range": "± 1546",
            "unit": "ns/iter"
          },
          {
            "name": "insert_with_branch/insert_small_threshold",
            "value": 100583,
            "range": "± 12545",
            "unit": "ns/iter"
          },
          {
            "name": "space_state_lookup/get_space_branch_state",
            "value": 272,
            "range": "± 6",
            "unit": "ns/iter"
          },
          {
            "name": "hash_branch_matching/assign_branch_unfractured",
            "value": 243,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "hash_branch_matching/assign_branch_fractured",
            "value": 293,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/2MB",
            "value": 1553564,
            "range": "± 1422",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/10MB",
            "value": 12974106,
            "range": "± 239112",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/50MB",
            "value": 65368163,
            "range": "± 293017",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/100MB",
            "value": 130254260,
            "range": "± 524834",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/2MB",
            "value": 3078596,
            "range": "± 23782",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/10MB",
            "value": 15460088,
            "range": "± 160105",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/50MB",
            "value": 103244934,
            "range": "± 569760",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/2MB",
            "value": 1684078,
            "range": "± 1147",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/10MB",
            "value": 8534542,
            "range": "± 71990",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/50MB",
            "value": 45089415,
            "range": "± 165674",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/2",
            "value": 740,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/10",
            "value": 3072,
            "range": "± 7",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/50",
            "value": 14133,
            "range": "± 37",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/100",
            "value": 27618,
            "range": "± 81",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/500",
            "value": 134756,
            "range": "± 176",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/1024",
            "value": 279738,
            "range": "± 356",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/2",
            "value": 892,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/10",
            "value": 3868,
            "range": "± 124",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/50",
            "value": 18226,
            "range": "± 19",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/100",
            "value": 35595,
            "range": "± 29",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/500",
            "value": 177215,
            "range": "± 263",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/1024",
            "value": 363452,
            "range": "± 571",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/1MB",
            "value": 777348,
            "range": "± 435",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/10MB",
            "value": 7826659,
            "range": "± 21902",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/100MB",
            "value": 125245414,
            "range": "± 695635",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/500MB",
            "value": 641501958,
            "range": "± 9711785",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/1024MB",
            "value": 1323990425,
            "range": "± 4420742",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/10",
            "value": 37963,
            "range": "± 68",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/50",
            "value": 151298,
            "range": "± 191",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/100",
            "value": 291679,
            "range": "± 422",
            "unit": "ns/iter"
          },
          {
            "name": "decay_simulation/10k_posts_60_days",
            "value": 21820653,
            "range": "± 1061857",
            "unit": "ns/iter"
          },
          {
            "name": "decay_simulation_large/100k_posts_60_days",
            "value": 244595441,
            "range": "± 5497562",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/1000",
            "value": 30,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/10000",
            "value": 50145,
            "range": "± 421",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/50000",
            "value": 220566,
            "range": "± 3561",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/100",
            "value": 32097,
            "range": "± 20",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/1000",
            "value": 326274,
            "range": "± 322",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/10000",
            "value": 3266440,
            "range": "± 50554",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/100000",
            "value": 32695239,
            "range": "± 21949",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/1000",
            "value": 1972,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/10000",
            "value": 18496,
            "range": "± 26",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/100000",
            "value": 149507,
            "range": "± 932",
            "unit": "ns/iter"
          },
          {
            "name": "header_hash",
            "value": 339,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "meets_difficulty",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Budget_1GB",
            "value": 2904053,
            "range": "± 50186",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Standard_5GB",
            "value": 16067053,
            "range": "± 332048",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Flagship_10GB",
            "value": 33789441,
            "range": "± 612917",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/50",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/75",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/90",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/95",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/99",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/1KB",
            "value": 343418,
            "range": "± 30111",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/10KB",
            "value": 368534,
            "range": "± 21501",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/100KB",
            "value": 575155,
            "range": "± 44389",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/100",
            "value": 1473,
            "range": "± 13",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/1000",
            "value": 15216,
            "range": "± 72",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/10000",
            "value": 222760,
            "range": "± 5158",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/steady_state",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/daily_growth",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/avg_post_size",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/10_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/100_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/1000_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/10000_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/budget_1gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/standard_5gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/flagship_10gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/root_block",
            "value": 5451,
            "range": "± 700",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/space_block",
            "value": 583,
            "range": "± 11",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/content_block",
            "value": 599,
            "range": "± 13",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/1024",
            "value": 6645,
            "range": "± 4055",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/4096",
            "value": 13790,
            "range": "± 8084",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/65536",
            "value": 150459,
            "range": "± 55455",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/1048576",
            "value": 2178088,
            "range": "± 101128",
            "unit": "ns/iter"
          },
          {
            "name": "random_read/root_block_1000",
            "value": 746,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/1024_bytes",
            "value": 10442,
            "range": "± 164",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/65536_bytes",
            "value": 60188,
            "range": "± 116",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/1048576_bytes",
            "value": 831712,
            "range": "± 7784",
            "unit": "ns/iter"
          },
          {
            "name": "cache/add_entry",
            "value": 550,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "cache/access",
            "value": 265,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/100",
            "value": 29366,
            "range": "± 150",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/1000",
            "value": 50159,
            "range": "± 1203",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/10000",
            "value": 50302,
            "range": "± 638",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/1048576_bytes",
            "value": 780070,
            "range": "± 692",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/5242880_bytes",
            "value": 3909048,
            "range": "± 5203",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/10485760_bytes",
            "value": 7976017,
            "range": "± 14426",
            "unit": "ns/iter"
          },
          {
            "name": "startup/empty_db",
            "value": 2110734,
            "range": "± 30890",
            "unit": "ns/iter"
          },
          {
            "name": "startup/populated_db",
            "value": 6850323,
            "range": "± 237240",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/100",
            "value": 414457,
            "range": "± 25196",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/1000",
            "value": 535460,
            "range": "± 33788",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/10000",
            "value": 525834,
            "range": "± 39921",
            "unit": "ns/iter"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "admin@adminwizard.tech",
            "name": "AdminWizard"
          },
          "committer": {
            "email": "admin@adminwizard.tech",
            "name": "AdminWizard"
          },
          "distinct": true,
          "id": "48c07c6454ac9b9a502808826d7f4eaf51c2db2c",
          "message": "fix(cli): derive space id identically to the node so `space create` prints the real id\n\n`sw space create` computed the space id as the raw PoW hash[..16] and printed\nit, but the node's create_space RPC derives apply_class(SpaceClass::Social,\nhash) = 0x01 || hash[..15] (and name-addresses app spaces). The two never\nmatched, so the id the CLI told you to post to did not exist on-chain\n(\"Space ... does not exist\"). This surfaced after the space-class byte reset.\n\nExtract one canonical derive_space_id(name, pow_hash) into types::space_class\nand call it from both the node RPC and the CLI, so the derivation can't drift\nagain. parse_app_space_name/app_space_id_16 move there too.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>",
          "timestamp": "2026-07-12T12:57:43-04:00",
          "tree_id": "fbbeec4b4688bcbd8ec954a1f10ee3006db56efd",
          "url": "https://github.com/superness/swimchain/commit/48c07c6454ac9b9a502808826d7f4eaf51c2db2c"
        },
        "date": 1783877646683,
        "tool": "cargo",
        "benches": [
          {
            "name": "mobile_single_hash/mobile_64mib_p2",
            "value": 91205517,
            "range": "± 1174186",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_single_hash/desktop_64mib_p4",
            "value": 92670833,
            "range": "± 724793",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_single_hash/test_1mib_p1",
            "value": 402434,
            "range": "± 819",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/4",
            "value": 1697464711,
            "range": "± 1826497348",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/6",
            "value": 5809120754,
            "range": "± 4365694686",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/8",
            "value": 32926896933,
            "range": "± 20071093758",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/4",
            "value": 6150410,
            "range": "± 1359907",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/6",
            "value": 27784978,
            "range": "± 15354488",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/8",
            "value": 70076231,
            "range": "± 50538051",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/10",
            "value": 138965209,
            "range": "± 106647657",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/12",
            "value": 726150775,
            "range": "± 1483541608",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Post",
            "value": 1037165801,
            "range": "± 1615925394",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Reply",
            "value": 1851504553,
            "range": "± 1213411310",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Engage",
            "value": 904614687,
            "range": "± 1642898633",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/3G_2mbps",
            "value": 3039381347,
            "range": "± 1933843",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/4G_10mbps",
            "value": 2984,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/WiFi_50mbps",
            "value": 2990,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/1KB",
            "value": 4719,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/4KB",
            "value": 1218,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/16KB",
            "value": 364,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/64KB",
            "value": 127,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "node_startup",
            "value": 2512483472,
            "range": "± 78418694",
            "unit": "ns/iter"
          },
          {
            "name": "node_shutdown",
            "value": 2359921701,
            "range": "± 1480645",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/2",
            "value": 4820322117,
            "range": "± 65862589",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/3",
            "value": 7192694687,
            "range": "± 174462646",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/5",
            "value": 12037692400,
            "range": "± 54682476",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/10",
            "value": 24021406719,
            "range": "± 300299974",
            "unit": "ns/iter"
          },
          {
            "name": "chain_store_access",
            "value": 3,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "connection_manager_access",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_info",
            "value": 163450,
            "range": "± 2947",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_sync_status",
            "value": 640676,
            "range": "± 22291",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_chain_stats",
            "value": 163786,
            "range": "± 1544",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_peers",
            "value": 156050,
            "range": "± 2004",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/list_spaces",
            "value": 158892,
            "range": "± 7624",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/feed_poll",
            "value": 962976,
            "range": "± 7172",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/create_space",
            "value": 7651312,
            "range": "± 759387",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/submit_post",
            "value": 18659026,
            "range": "± 1962357",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/list_space_content_populated",
            "value": 4375351,
            "range": "± 37052",
            "unit": "ns/iter"
          },
          {
            "name": "keypair_generation",
            "value": 18721,
            "range": "± 47",
            "unit": "ns/iter"
          },
          {
            "name": "sign_32bytes",
            "value": 37082,
            "range": "± 53",
            "unit": "ns/iter"
          },
          {
            "name": "sign_1kb",
            "value": 41231,
            "range": "± 100",
            "unit": "ns/iter"
          },
          {
            "name": "verify_signature",
            "value": 39775,
            "range": "± 95",
            "unit": "ns/iter"
          },
          {
            "name": "encode_address",
            "value": 332,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decode_address",
            "value": 483,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/8",
            "value": 37061,
            "range": "± 368",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/12",
            "value": 312586,
            "range": "± 12526",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/16",
            "value": 5015026,
            "range": "± 857329",
            "unit": "ns/iter"
          },
          {
            "name": "encrypt_private_key",
            "value": 92115362,
            "range": "± 1266333",
            "unit": "ns/iter"
          },
          {
            "name": "decrypt_private_key",
            "value": 91365931,
            "range": "± 379386",
            "unit": "ns/iter"
          },
          {
            "name": "export_identity",
            "value": 92697917,
            "range": "± 2354708",
            "unit": "ns/iter"
          },
          {
            "name": "import_identity",
            "value": 95377778,
            "range": "± 2201247",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_1mib",
            "value": 393314,
            "range": "± 927",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/4",
            "value": 6045460,
            "range": "± 733779",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/8",
            "value": 67981536,
            "range": "± 87168403",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/10",
            "value": 358506010,
            "range": "± 311081303",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/12",
            "value": 1497821457,
            "range": "± 1306366049",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_64mib",
            "value": 93734665,
            "range": "± 850736",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_mobile",
            "value": 95502911,
            "range": "± 6295745",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/test_1mib",
            "value": 393764,
            "range": "± 732",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/mobile_64mib_p2",
            "value": 92725352,
            "range": "± 1269348",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/prod_64mib_p4",
            "value": 92788787,
            "range": "± 621720",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/100",
            "value": 1752339,
            "range": "± 39776",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/500",
            "value": 5641320,
            "range": "± 107063",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/1000",
            "value": 10891858,
            "range": "± 104640",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/100",
            "value": 233,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/1000",
            "value": 247,
            "range": "± 8",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/5000",
            "value": 323,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "insert_with_branch/insert_default_threshold",
            "value": 23924,
            "range": "± 2048",
            "unit": "ns/iter"
          },
          {
            "name": "insert_with_branch/insert_small_threshold",
            "value": 107116,
            "range": "± 19801",
            "unit": "ns/iter"
          },
          {
            "name": "space_state_lookup/get_space_branch_state",
            "value": 242,
            "range": "± 7",
            "unit": "ns/iter"
          },
          {
            "name": "hash_branch_matching/assign_branch_unfractured",
            "value": 209,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "hash_branch_matching/assign_branch_fractured",
            "value": 261,
            "range": "± 7",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/2MB",
            "value": 1404081,
            "range": "± 2185",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/10MB",
            "value": 11134693,
            "range": "± 228563",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/50MB",
            "value": 56914206,
            "range": "± 602389",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/100MB",
            "value": 112847603,
            "range": "± 345099",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/2MB",
            "value": 2758676,
            "range": "± 24356",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/10MB",
            "value": 13851987,
            "range": "± 148495",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/50MB",
            "value": 90001038,
            "range": "± 618968",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/2MB",
            "value": 1497043,
            "range": "± 1425",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/10MB",
            "value": 7461766,
            "range": "± 21809",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/50MB",
            "value": 40138856,
            "range": "± 313578",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/2",
            "value": 778,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/10",
            "value": 3332,
            "range": "± 8",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/50",
            "value": 15497,
            "range": "± 140",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/100",
            "value": 34861,
            "range": "± 40",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/500",
            "value": 150160,
            "range": "± 352",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/1024",
            "value": 306498,
            "range": "± 511",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/2",
            "value": 849,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/10",
            "value": 3718,
            "range": "± 5",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/50",
            "value": 17817,
            "range": "± 38",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/100",
            "value": 35524,
            "range": "± 58",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/500",
            "value": 173597,
            "range": "± 1043",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/1024",
            "value": 355476,
            "range": "± 661",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/1MB",
            "value": 697441,
            "range": "± 635",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/10MB",
            "value": 7002531,
            "range": "± 15239",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/100MB",
            "value": 109893094,
            "range": "± 331754",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/500MB",
            "value": 556807485,
            "range": "± 3282576",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/1024MB",
            "value": 1154786453,
            "range": "± 1868215",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/10",
            "value": 34239,
            "range": "± 89",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/50",
            "value": 135711,
            "range": "± 324",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/100",
            "value": 260807,
            "range": "± 301",
            "unit": "ns/iter"
          },
          {
            "name": "decay_simulation/10k_posts_60_days",
            "value": 16896907,
            "range": "± 426686",
            "unit": "ns/iter"
          },
          {
            "name": "decay_simulation_large/100k_posts_60_days",
            "value": 203891050,
            "range": "± 1827996",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/1000",
            "value": 27,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/10000",
            "value": 53071,
            "range": "± 586",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/50000",
            "value": 242375,
            "range": "± 2629",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/100",
            "value": 28900,
            "range": "± 59",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/1000",
            "value": 304101,
            "range": "± 400",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/10000",
            "value": 2964036,
            "range": "± 2517",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/100000",
            "value": 30198257,
            "range": "± 16712",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/1000",
            "value": 1633,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/10000",
            "value": 25899,
            "range": "± 65",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/100000",
            "value": 150174,
            "range": "± 484",
            "unit": "ns/iter"
          },
          {
            "name": "header_hash",
            "value": 320,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "meets_difficulty",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Budget_1GB",
            "value": 2961632,
            "range": "± 19654",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Standard_5GB",
            "value": 15538959,
            "range": "± 117043",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Flagship_10GB",
            "value": 31041514,
            "range": "± 246885",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/50",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/75",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/90",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/95",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/99",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/1KB",
            "value": 425742,
            "range": "± 32521",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/10KB",
            "value": 459076,
            "range": "± 35645",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/100KB",
            "value": 633165,
            "range": "± 30614",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/100",
            "value": 1377,
            "range": "± 7",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/1000",
            "value": 16445,
            "range": "± 596",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/10000",
            "value": 210608,
            "range": "± 1881",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/steady_state",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/daily_growth",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/avg_post_size",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/10_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/100_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/1000_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/10000_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/budget_1gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/standard_5gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/flagship_10gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/root_block",
            "value": 5483,
            "range": "± 686",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/space_block",
            "value": 628,
            "range": "± 5",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/content_block",
            "value": 609,
            "range": "± 5",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/1024",
            "value": 10029,
            "range": "± 9870",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/4096",
            "value": 19451,
            "range": "± 16688",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/65536",
            "value": 159756,
            "range": "± 65530",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/1048576",
            "value": 2220842,
            "range": "± 122360",
            "unit": "ns/iter"
          },
          {
            "name": "random_read/root_block_1000",
            "value": 724,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/1024_bytes",
            "value": 8685,
            "range": "± 11",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/65536_bytes",
            "value": 53164,
            "range": "± 174",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/1048576_bytes",
            "value": 733944,
            "range": "± 658",
            "unit": "ns/iter"
          },
          {
            "name": "cache/add_entry",
            "value": 581,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "cache/access",
            "value": 282,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/100",
            "value": 28726,
            "range": "± 178",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/1000",
            "value": 53492,
            "range": "± 169",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/10000",
            "value": 53827,
            "range": "± 248",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/1048576_bytes",
            "value": 706244,
            "range": "± 8305",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/5242880_bytes",
            "value": 3527652,
            "range": "± 6907",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/10485760_bytes",
            "value": 7181759,
            "range": "± 120519",
            "unit": "ns/iter"
          },
          {
            "name": "startup/empty_db",
            "value": 2513814,
            "range": "± 89431",
            "unit": "ns/iter"
          },
          {
            "name": "startup/populated_db",
            "value": 6615607,
            "range": "± 285455",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/100",
            "value": 513639,
            "range": "± 23743",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/1000",
            "value": 634832,
            "range": "± 18755",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/10000",
            "value": 618079,
            "range": "± 16649",
            "unit": "ns/iter"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "admin@adminwizard.tech",
            "name": "AdminWizard"
          },
          "committer": {
            "email": "admin@adminwizard.tech",
            "name": "AdminWizard"
          },
          "distinct": true,
          "id": "d6117fe715c7e302af5ca898c21f302a25211bcb",
          "message": "fix(net): bound peer send with 3s timeout so a stuck peer can't hang an RPC\n\nsubmit_post gossips a self-originated action inline (pool.send_to().await)\nbefore returning; a half-open TCP connection to a dead/leaked peer blocked\nthat send indefinitely, so the RPC never responded and the client's 30s\ntimeout fired -> 'failed to submit post' even though the post was accepted\ninto the mempool. Wrap every conn.send in send_to/broadcast/broadcast_except\nwith PEER_SEND_TIMEOUT (3s); a timed-out send is dropped and logged.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>",
          "timestamp": "2026-07-12T13:20:37-04:00",
          "tree_id": "7da070db3ecbe985bc6eb4fe9231ab280d36e34e",
          "url": "https://github.com/superness/swimchain/commit/d6117fe715c7e302af5ca898c21f302a25211bcb"
        },
        "date": 1783879327222,
        "tool": "cargo",
        "benches": [
          {
            "name": "mobile_single_hash/mobile_64mib_p2",
            "value": 94642300,
            "range": "± 1062412",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_single_hash/desktop_64mib_p4",
            "value": 95650079,
            "range": "± 813176",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_single_hash/test_1mib_p1",
            "value": 403813,
            "range": "± 1130",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/4",
            "value": 611222966,
            "range": "± 511253528",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/6",
            "value": 5432802604,
            "range": "± 8648027825",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/8",
            "value": 19728523726,
            "range": "± 35086227159",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/4",
            "value": 6598276,
            "range": "± 688860",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/6",
            "value": 21454393,
            "range": "± 5704510",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/8",
            "value": 109094949,
            "range": "± 69797734",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/10",
            "value": 430993502,
            "range": "± 367869734",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/12",
            "value": 854433201,
            "range": "± 1499131941",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Post",
            "value": 758651649,
            "range": "± 807437808",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Reply",
            "value": 1177978591,
            "range": "± 747753619",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Engage",
            "value": 802102643,
            "range": "± 1441820897",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/3G_2mbps",
            "value": 3037208882,
            "range": "± 1399604",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/4G_10mbps",
            "value": 2984,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/WiFi_50mbps",
            "value": 2988,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/1KB",
            "value": 4718,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/4KB",
            "value": 1217,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/16KB",
            "value": 364,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/64KB",
            "value": 127,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "node_startup",
            "value": 2562400338,
            "range": "± 53303990",
            "unit": "ns/iter"
          },
          {
            "name": "node_shutdown",
            "value": 2357822298,
            "range": "± 3390430",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/2",
            "value": 4820687041,
            "range": "± 45528881",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/3",
            "value": 7342407281,
            "range": "± 188896708",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/5",
            "value": 12131820688,
            "range": "± 138038407",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/10",
            "value": 24396615261,
            "range": "± 378129746",
            "unit": "ns/iter"
          },
          {
            "name": "chain_store_access",
            "value": 3,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "connection_manager_access",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_info",
            "value": 162228,
            "range": "± 3341",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_sync_status",
            "value": 652839,
            "range": "± 20155",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_chain_stats",
            "value": 161722,
            "range": "± 3857",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_peers",
            "value": 154875,
            "range": "± 2232",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/list_spaces",
            "value": 157656,
            "range": "± 2673",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/feed_poll",
            "value": 988120,
            "range": "± 8131",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/create_space",
            "value": 8390023,
            "range": "± 923572",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/submit_post",
            "value": 23966882,
            "range": "± 1980326",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/list_space_content_populated",
            "value": 4310463,
            "range": "± 52272",
            "unit": "ns/iter"
          },
          {
            "name": "keypair_generation",
            "value": 20914,
            "range": "± 11",
            "unit": "ns/iter"
          },
          {
            "name": "sign_32bytes",
            "value": 41170,
            "range": "± 124",
            "unit": "ns/iter"
          },
          {
            "name": "sign_1kb",
            "value": 45639,
            "range": "± 63",
            "unit": "ns/iter"
          },
          {
            "name": "verify_signature",
            "value": 42239,
            "range": "± 138",
            "unit": "ns/iter"
          },
          {
            "name": "encode_address",
            "value": 361,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "decode_address",
            "value": 530,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/8",
            "value": 40662,
            "range": "± 477",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/12",
            "value": 334674,
            "range": "± 12552",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/16",
            "value": 4995095,
            "range": "± 604570",
            "unit": "ns/iter"
          },
          {
            "name": "encrypt_private_key",
            "value": 95332847,
            "range": "± 945410",
            "unit": "ns/iter"
          },
          {
            "name": "decrypt_private_key",
            "value": 94598018,
            "range": "± 2662863",
            "unit": "ns/iter"
          },
          {
            "name": "export_identity",
            "value": 95710164,
            "range": "± 2800235",
            "unit": "ns/iter"
          },
          {
            "name": "import_identity",
            "value": 95814224,
            "range": "± 2025854",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_1mib",
            "value": 391662,
            "range": "± 517",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/4",
            "value": 6888428,
            "range": "± 754920",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/8",
            "value": 101047526,
            "range": "± 49061426",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/10",
            "value": 312312791,
            "range": "± 197532467",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/12",
            "value": 1070636401,
            "range": "± 1497609468",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_64mib",
            "value": 96627754,
            "range": "± 8815053",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_mobile",
            "value": 95961310,
            "range": "± 717764",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/test_1mib",
            "value": 390924,
            "range": "± 414",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/mobile_64mib_p2",
            "value": 97436776,
            "range": "± 2379918",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/prod_64mib_p4",
            "value": 96845542,
            "range": "± 2111598",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/100",
            "value": 1656148,
            "range": "± 150162",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/500",
            "value": 5815494,
            "range": "± 132213",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/1000",
            "value": 11287831,
            "range": "± 200493",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/100",
            "value": 265,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/1000",
            "value": 277,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/5000",
            "value": 367,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "insert_with_branch/insert_default_threshold",
            "value": 24382,
            "range": "± 1782",
            "unit": "ns/iter"
          },
          {
            "name": "insert_with_branch/insert_small_threshold",
            "value": 100059,
            "range": "± 12060",
            "unit": "ns/iter"
          },
          {
            "name": "space_state_lookup/get_space_branch_state",
            "value": 266,
            "range": "± 6",
            "unit": "ns/iter"
          },
          {
            "name": "hash_branch_matching/assign_branch_unfractured",
            "value": 242,
            "range": "± 7",
            "unit": "ns/iter"
          },
          {
            "name": "hash_branch_matching/assign_branch_fractured",
            "value": 298,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/2MB",
            "value": 1548478,
            "range": "± 614",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/10MB",
            "value": 12799545,
            "range": "± 68139",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/50MB",
            "value": 65205344,
            "range": "± 229456",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/100MB",
            "value": 128901985,
            "range": "± 2395896",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/2MB",
            "value": 3083147,
            "range": "± 24175",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/10MB",
            "value": 15602400,
            "range": "± 124305",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/50MB",
            "value": 103227738,
            "range": "± 591970",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/2MB",
            "value": 1683929,
            "range": "± 1449",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/10MB",
            "value": 8488433,
            "range": "± 39169",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/50MB",
            "value": 45024311,
            "range": "± 90988",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/2",
            "value": 732,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/10",
            "value": 3106,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/50",
            "value": 14033,
            "range": "± 18",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/100",
            "value": 32979,
            "range": "± 94",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/500",
            "value": 134970,
            "range": "± 104",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/1024",
            "value": 276411,
            "range": "± 1597",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/2",
            "value": 895,
            "range": "± 27",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/10",
            "value": 3928,
            "range": "± 14",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/50",
            "value": 18178,
            "range": "± 19",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/100",
            "value": 36230,
            "range": "± 132",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/500",
            "value": 178018,
            "range": "± 469",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/1024",
            "value": 363257,
            "range": "± 17725",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/1MB",
            "value": 777664,
            "range": "± 901",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/10MB",
            "value": 7995961,
            "range": "± 33274",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/100MB",
            "value": 125630321,
            "range": "± 810801",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/500MB",
            "value": 639502969,
            "range": "± 6973090",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/1024MB",
            "value": 1312353720,
            "range": "± 3913861",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/10",
            "value": 38137,
            "range": "± 63",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/50",
            "value": 146981,
            "range": "± 2260",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/100",
            "value": 281999,
            "range": "± 876",
            "unit": "ns/iter"
          },
          {
            "name": "decay_simulation/10k_posts_60_days",
            "value": 19689863,
            "range": "± 879331",
            "unit": "ns/iter"
          },
          {
            "name": "decay_simulation_large/100k_posts_60_days",
            "value": 230927837,
            "range": "± 2244474",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/1000",
            "value": 30,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/10000",
            "value": 49989,
            "range": "± 445",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/50000",
            "value": 295858,
            "range": "± 5611",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/100",
            "value": 32102,
            "range": "± 37",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/1000",
            "value": 330833,
            "range": "± 1804",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/10000",
            "value": 3323988,
            "range": "± 5155",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/100000",
            "value": 33292692,
            "range": "± 48161",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/1000",
            "value": 1855,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/10000",
            "value": 20780,
            "range": "± 66",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/100000",
            "value": 152810,
            "range": "± 8583",
            "unit": "ns/iter"
          },
          {
            "name": "header_hash",
            "value": 347,
            "range": "± 9",
            "unit": "ns/iter"
          },
          {
            "name": "meets_difficulty",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Budget_1GB",
            "value": 2953297,
            "range": "± 21688",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Standard_5GB",
            "value": 16036960,
            "range": "± 397157",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Flagship_10GB",
            "value": 35023315,
            "range": "± 1411972",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/50",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/75",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/90",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/95",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/99",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/1KB",
            "value": 427834,
            "range": "± 18929",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/10KB",
            "value": 467989,
            "range": "± 19824",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/100KB",
            "value": 660086,
            "range": "± 26445",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/100",
            "value": 1397,
            "range": "± 26",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/1000",
            "value": 16484,
            "range": "± 277",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/10000",
            "value": 214689,
            "range": "± 2515",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/steady_state",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/daily_growth",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/avg_post_size",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/10_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/100_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/1000_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/10000_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/budget_1gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/standard_5gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/flagship_10gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/root_block",
            "value": 5336,
            "range": "± 557",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/space_block",
            "value": 630,
            "range": "± 6",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/content_block",
            "value": 609,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/1024",
            "value": 9848,
            "range": "± 9251",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/4096",
            "value": 18407,
            "range": "± 16827",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/65536",
            "value": 153637,
            "range": "± 68333",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/1048576",
            "value": 2202322,
            "range": "± 110164",
            "unit": "ns/iter"
          },
          {
            "name": "random_read/root_block_1000",
            "value": 719,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/1024_bytes",
            "value": 8610,
            "range": "± 6",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/65536_bytes",
            "value": 52181,
            "range": "± 241",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/1048576_bytes",
            "value": 736212,
            "range": "± 1054",
            "unit": "ns/iter"
          },
          {
            "name": "cache/add_entry",
            "value": 577,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "cache/access",
            "value": 278,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/100",
            "value": 28542,
            "range": "± 110",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/1000",
            "value": 53166,
            "range": "± 277",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/10000",
            "value": 53132,
            "range": "± 1107",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/1048576_bytes",
            "value": 705454,
            "range": "± 4600",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/5242880_bytes",
            "value": 3551751,
            "range": "± 44063",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/10485760_bytes",
            "value": 7198265,
            "range": "± 31395",
            "unit": "ns/iter"
          },
          {
            "name": "startup/empty_db",
            "value": 2538066,
            "range": "± 29636",
            "unit": "ns/iter"
          },
          {
            "name": "startup/populated_db",
            "value": 6665192,
            "range": "± 58914",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/100",
            "value": 507573,
            "range": "± 7702",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/1000",
            "value": 635363,
            "range": "± 13313",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/10000",
            "value": 629993,
            "range": "± 9220",
            "unit": "ns/iter"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "admin@adminwizard.tech",
            "name": "AdminWizard"
          },
          "committer": {
            "email": "admin@adminwizard.tech",
            "name": "AdminWizard"
          },
          "distinct": true,
          "id": "57d44e6a1163984d19d5c6fecf548531aa8df94a",
          "message": "feat(net): frequency drift on-chain audit log (storage + apply + RPC + auto-emit)\n\nCompletes the \"log\" half of frequency isolation's hybrid design: a node\nrecords its frequency drifts on-chain so gateways/clients can audit which\nnodes drifted where. Self-authored, log-only — never gates peer selection.\n\n- ChainStore: frequency_drifts tree + FrequencyDriftRecord (latest-per-actor,\n  monotonic by timestamp) with put/get_all.\n- router: apply_frequency_drift_actions_from_block verifies the drift signature\n  and persists records from ingested blocks (both handle_block_data + handle_blocks).\n- rpc: list_frequency_drifts (auth-exempt) alongside get_node_frequency.\n- Node timer emits a signed + PoW'd FrequencyDrift into the mempool on a primary\n  change, guarded against re-emit on restart, plus an immediate local self-record\n  so RPC reflects it at once.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>",
          "timestamp": "2026-07-12T14:00:38-04:00",
          "tree_id": "2898e3bea9e65acf773dec3e30846daff6544608",
          "url": "https://github.com/superness/swimchain/commit/57d44e6a1163984d19d5c6fecf548531aa8df94a"
        },
        "date": 1783880775990,
        "tool": "cargo",
        "benches": [
          {
            "name": "mobile_single_hash/mobile_64mib_p2",
            "value": 75269296,
            "range": "± 339602",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_single_hash/desktop_64mib_p4",
            "value": 75411606,
            "range": "± 170228",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_single_hash/test_1mib_p1",
            "value": 306387,
            "range": "± 453",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/4",
            "value": 1054244550,
            "range": "± 1641349703",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/6",
            "value": 3928231826,
            "range": "± 10487632580",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/8",
            "value": 18733685442,
            "range": "± 21361442900",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/4",
            "value": 4527344,
            "range": "± 606789",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/6",
            "value": 24236013,
            "range": "± 9277265",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/8",
            "value": 76574350,
            "range": "± 41905978",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/10",
            "value": 236621460,
            "range": "± 255685802",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/12",
            "value": 625221422,
            "range": "± 789058840",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Post",
            "value": 955089536,
            "range": "± 846452201",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Reply",
            "value": 692462525,
            "range": "± 632142884",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Engage",
            "value": 342243313,
            "range": "± 1494857390",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/3G_2mbps",
            "value": 3056755942,
            "range": "± 807927",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/4G_10mbps",
            "value": 2555,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/WiFi_50mbps",
            "value": 2572,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/1KB",
            "value": 4021,
            "range": "± 7",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/4KB",
            "value": 1050,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/16KB",
            "value": 313,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/64KB",
            "value": 109,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "node_startup",
            "value": 2466029318,
            "range": "± 105932306",
            "unit": "ns/iter"
          },
          {
            "name": "node_shutdown",
            "value": 2355131513,
            "range": "± 3300405",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/2",
            "value": 4824675450,
            "range": "± 127735806",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/3",
            "value": 7306019151,
            "range": "± 190084241",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/5",
            "value": 12058496635,
            "range": "± 366105742",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/10",
            "value": 24328547573,
            "range": "± 315021458",
            "unit": "ns/iter"
          },
          {
            "name": "chain_store_access",
            "value": 3,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "connection_manager_access",
            "value": 3,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_info",
            "value": 113925,
            "range": "± 2567",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_sync_status",
            "value": 555050,
            "range": "± 24296",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_chain_stats",
            "value": 114600,
            "range": "± 3127",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_peers",
            "value": 107295,
            "range": "± 1812",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/list_spaces",
            "value": 108824,
            "range": "± 1698",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/feed_poll",
            "value": 786095,
            "range": "± 9736",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/create_space",
            "value": 6037543,
            "range": "± 995173",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/submit_post",
            "value": 16953915,
            "range": "± 1746802",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/list_space_content_populated",
            "value": 4260650,
            "range": "± 11465",
            "unit": "ns/iter"
          },
          {
            "name": "keypair_generation",
            "value": 18711,
            "range": "± 71",
            "unit": "ns/iter"
          },
          {
            "name": "sign_32bytes",
            "value": 37059,
            "range": "± 17",
            "unit": "ns/iter"
          },
          {
            "name": "sign_1kb",
            "value": 41204,
            "range": "± 848",
            "unit": "ns/iter"
          },
          {
            "name": "verify_signature",
            "value": 43567,
            "range": "± 665",
            "unit": "ns/iter"
          },
          {
            "name": "encode_address",
            "value": 333,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "decode_address",
            "value": 485,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/8",
            "value": 37145,
            "range": "± 770",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/12",
            "value": 310438,
            "range": "± 24286",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/16",
            "value": 4702357,
            "range": "± 630635",
            "unit": "ns/iter"
          },
          {
            "name": "encrypt_private_key",
            "value": 89702021,
            "range": "± 1188474",
            "unit": "ns/iter"
          },
          {
            "name": "decrypt_private_key",
            "value": 91768895,
            "range": "± 1191385",
            "unit": "ns/iter"
          },
          {
            "name": "export_identity",
            "value": 90410690,
            "range": "± 2497019",
            "unit": "ns/iter"
          },
          {
            "name": "import_identity",
            "value": 90335437,
            "range": "± 950161",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_1mib",
            "value": 392649,
            "range": "± 573",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/4",
            "value": 5958591,
            "range": "± 794887",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/8",
            "value": 87737452,
            "range": "± 15574248",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/10",
            "value": 227206783,
            "range": "± 588464788",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/12",
            "value": 1622618476,
            "range": "± 2495354342",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_64mib",
            "value": 93027066,
            "range": "± 1918554",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_mobile",
            "value": 91959468,
            "range": "± 785831",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/test_1mib",
            "value": 394054,
            "range": "± 1467",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/mobile_64mib_p2",
            "value": 90650966,
            "range": "± 860520",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/prod_64mib_p4",
            "value": 93377411,
            "range": "± 1939996",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/100",
            "value": 1952319,
            "range": "± 184341",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/500",
            "value": 5972380,
            "range": "± 135692",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/1000",
            "value": 10892909,
            "range": "± 192862",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/100",
            "value": 234,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/1000",
            "value": 248,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/5000",
            "value": 317,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "insert_with_branch/insert_default_threshold",
            "value": 22748,
            "range": "± 1588",
            "unit": "ns/iter"
          },
          {
            "name": "insert_with_branch/insert_small_threshold",
            "value": 98552,
            "range": "± 11916",
            "unit": "ns/iter"
          },
          {
            "name": "space_state_lookup/get_space_branch_state",
            "value": 230,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "hash_branch_matching/assign_branch_unfractured",
            "value": 209,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "hash_branch_matching/assign_branch_fractured",
            "value": 256,
            "range": "± 10",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/2MB",
            "value": 1402405,
            "range": "± 4145",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/10MB",
            "value": 11280181,
            "range": "± 103093",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/50MB",
            "value": 57061761,
            "range": "± 139951",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/100MB",
            "value": 114010171,
            "range": "± 1009941",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/2MB",
            "value": 2755552,
            "range": "± 42722",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/10MB",
            "value": 13922872,
            "range": "± 262213",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/50MB",
            "value": 91447456,
            "range": "± 594241",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/2MB",
            "value": 1527766,
            "range": "± 1423",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/10MB",
            "value": 7811430,
            "range": "± 63735",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/50MB",
            "value": 40726893,
            "range": "± 363274",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/2",
            "value": 785,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/10",
            "value": 3330,
            "range": "± 12",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/50",
            "value": 15408,
            "range": "± 86",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/100",
            "value": 30521,
            "range": "± 72",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/500",
            "value": 149575,
            "range": "± 5524",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/1024",
            "value": 305182,
            "range": "± 159",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/2",
            "value": 864,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/10",
            "value": 3777,
            "range": "± 6",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/50",
            "value": 18153,
            "range": "± 13",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/100",
            "value": 35364,
            "range": "± 176",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/500",
            "value": 173235,
            "range": "± 3846",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/1024",
            "value": 355057,
            "range": "± 402",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/1MB",
            "value": 703024,
            "range": "± 1070",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/10MB",
            "value": 7069888,
            "range": "± 41905",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/100MB",
            "value": 109518563,
            "range": "± 3022878",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/500MB",
            "value": 562290311,
            "range": "± 3638852",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/1024MB",
            "value": 1157472144,
            "range": "± 2291396",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/10",
            "value": 34155,
            "range": "± 69",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/50",
            "value": 135090,
            "range": "± 280",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/100",
            "value": 267870,
            "range": "± 7183",
            "unit": "ns/iter"
          },
          {
            "name": "decay_simulation/10k_posts_60_days",
            "value": 17002557,
            "range": "± 712497",
            "unit": "ns/iter"
          },
          {
            "name": "decay_simulation_large/100k_posts_60_days",
            "value": 207976758,
            "range": "± 1796747",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/1000",
            "value": 25,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/10000",
            "value": 52848,
            "range": "± 554",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/50000",
            "value": 241734,
            "range": "± 1953",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/100",
            "value": 29336,
            "range": "± 105",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/1000",
            "value": 309122,
            "range": "± 658",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/10000",
            "value": 3108620,
            "range": "± 2659",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/100000",
            "value": 30366162,
            "range": "± 295974",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/1000",
            "value": 1630,
            "range": "± 73",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/10000",
            "value": 19566,
            "range": "± 355",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/100000",
            "value": 151103,
            "range": "± 924",
            "unit": "ns/iter"
          },
          {
            "name": "header_hash",
            "value": 318,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "meets_difficulty",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Budget_1GB",
            "value": 2925297,
            "range": "± 15173",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Standard_5GB",
            "value": 15512366,
            "range": "± 500303",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Flagship_10GB",
            "value": 31818663,
            "range": "± 614847",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/50",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/75",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/90",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/95",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/99",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/1KB",
            "value": 516811,
            "range": "± 53288",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/10KB",
            "value": 524586,
            "range": "± 60066",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/100KB",
            "value": 735229,
            "range": "± 29542",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/100",
            "value": 1401,
            "range": "± 26",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/1000",
            "value": 16527,
            "range": "± 191",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/10000",
            "value": 214151,
            "range": "± 3014",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/steady_state",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/daily_growth",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/avg_post_size",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/10_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/100_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/1000_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/10000_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/budget_1gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/standard_5gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/flagship_10gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/root_block",
            "value": 4847,
            "range": "± 398",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/space_block",
            "value": 614,
            "range": "± 8",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/content_block",
            "value": 587,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/1024",
            "value": 16123,
            "range": "± 18777",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/4096",
            "value": 22925,
            "range": "± 20978",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/65536",
            "value": 156603,
            "range": "± 75280",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/1048576",
            "value": 2160756,
            "range": "± 89028",
            "unit": "ns/iter"
          },
          {
            "name": "random_read/root_block_1000",
            "value": 704,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/1024_bytes",
            "value": 8558,
            "range": "± 5",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/65536_bytes",
            "value": 51643,
            "range": "± 69",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/1048576_bytes",
            "value": 726793,
            "range": "± 1144",
            "unit": "ns/iter"
          },
          {
            "name": "cache/add_entry",
            "value": 553,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "cache/access",
            "value": 263,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/100",
            "value": 28130,
            "range": "± 167",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/1000",
            "value": 54107,
            "range": "± 208",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/10000",
            "value": 54465,
            "range": "± 209",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/1048576_bytes",
            "value": 700304,
            "range": "± 236",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/5242880_bytes",
            "value": 3501957,
            "range": "± 2640",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/10485760_bytes",
            "value": 7007521,
            "range": "± 3672",
            "unit": "ns/iter"
          },
          {
            "name": "startup/empty_db",
            "value": 2327995,
            "range": "± 68455",
            "unit": "ns/iter"
          },
          {
            "name": "startup/populated_db",
            "value": 6199243,
            "range": "± 69657",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/100",
            "value": 603549,
            "range": "± 28111",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/1000",
            "value": 757673,
            "range": "± 46241",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/10000",
            "value": 742182,
            "range": "± 35654",
            "unit": "ns/iter"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "admin@adminwizard.tech",
            "name": "AdminWizard"
          },
          "committer": {
            "email": "admin@adminwizard.tech",
            "name": "AdminWizard"
          },
          "distinct": true,
          "id": "a5dec44f8f9f6eeee60416d0f995795147a1a916",
          "message": "feat(realtime): live spaces/posts/reactions via node events (no restart)\n\nThe node already emits content_new/content_engaged on ingest; wire the client\ndata hooks to them so the UI updates live instead of needing an app restart:\n- useSpaces subscribes to space_updated -> new spaces appear in Discover live\n- useSpaceThreads subscribes to content_new/content_engaged (scoped to spaceId)\n  -> new posts and reaction counts update live\nBoth use silent/in-place refetches (no loading flip) so nothing flashes or\njumps the viewport, debounced to collapse event bursts. Node side: emit\nspace_updated when a CreateSpace is gossiped in (router ingest) — it had arms\nfor Post/Reply/Engage but none for CreateSpace, so new spaces emitted nothing.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>",
          "timestamp": "2026-07-12T14:22:30-04:00",
          "tree_id": "6ce13cc9ed4afbc394b12f1f77e6f91886547759",
          "url": "https://github.com/superness/swimchain/commit/a5dec44f8f9f6eeee60416d0f995795147a1a916"
        },
        "date": 1783882666400,
        "tool": "cargo",
        "benches": [
          {
            "name": "mobile_single_hash/mobile_64mib_p2",
            "value": 93770148,
            "range": "± 545902",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_single_hash/desktop_64mib_p4",
            "value": 93642611,
            "range": "± 509172",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_single_hash/test_1mib_p1",
            "value": 403587,
            "range": "± 660",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/4",
            "value": 1347858568,
            "range": "± 696565586",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/6",
            "value": 6451359997,
            "range": "± 10501714055",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/8",
            "value": 16589774257,
            "range": "± 13170237319",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/4",
            "value": 6879199,
            "range": "± 1343583",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/6",
            "value": 30325004,
            "range": "± 7059020",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/8",
            "value": 81499051,
            "range": "± 28759796",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/10",
            "value": 189796695,
            "range": "± 209840344",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/12",
            "value": 963788737,
            "range": "± 558246191",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Post",
            "value": 872304924,
            "range": "± 444292056",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Reply",
            "value": 1872627915,
            "range": "± 1298993987",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Engage",
            "value": 1162755189,
            "range": "± 2608612984",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/3G_2mbps",
            "value": 3043222876,
            "range": "± 2322102",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/4G_10mbps",
            "value": 2985,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/WiFi_50mbps",
            "value": 2992,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/1KB",
            "value": 4719,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/4KB",
            "value": 1218,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/16KB",
            "value": 364,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/64KB",
            "value": 127,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "node_startup",
            "value": 2521913601,
            "range": "± 67071681",
            "unit": "ns/iter"
          },
          {
            "name": "node_shutdown",
            "value": 2356858041,
            "range": "± 2219744",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/2",
            "value": 4815691341,
            "range": "± 93995429",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/3",
            "value": 7272271668,
            "range": "± 63813431",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/5",
            "value": 12281815728,
            "range": "± 286003105",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/10",
            "value": 24287142175,
            "range": "± 358533860",
            "unit": "ns/iter"
          },
          {
            "name": "chain_store_access",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "connection_manager_access",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_info",
            "value": 163050,
            "range": "± 1589",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_sync_status",
            "value": 655888,
            "range": "± 28854",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_chain_stats",
            "value": 164309,
            "range": "± 3268",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_peers",
            "value": 154945,
            "range": "± 2379",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/list_spaces",
            "value": 157650,
            "range": "± 2217",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/feed_poll",
            "value": 986935,
            "range": "± 8000",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/create_space",
            "value": 7339010,
            "range": "± 1417107",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/submit_post",
            "value": 20335776,
            "range": "± 749930",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/list_space_content_populated",
            "value": 4414784,
            "range": "± 26940",
            "unit": "ns/iter"
          },
          {
            "name": "keypair_generation",
            "value": 16696,
            "range": "± 25",
            "unit": "ns/iter"
          },
          {
            "name": "sign_32bytes",
            "value": 33580,
            "range": "± 45",
            "unit": "ns/iter"
          },
          {
            "name": "sign_1kb",
            "value": 37954,
            "range": "± 15",
            "unit": "ns/iter"
          },
          {
            "name": "verify_signature",
            "value": 34390,
            "range": "± 13",
            "unit": "ns/iter"
          },
          {
            "name": "encode_address",
            "value": 324,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decode_address",
            "value": 472,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/8",
            "value": 36216,
            "range": "± 393",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/12",
            "value": 325642,
            "range": "± 10500",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/16",
            "value": 4834958,
            "range": "± 945318",
            "unit": "ns/iter"
          },
          {
            "name": "encrypt_private_key",
            "value": 97594638,
            "range": "± 1029710",
            "unit": "ns/iter"
          },
          {
            "name": "decrypt_private_key",
            "value": 97271815,
            "range": "± 796932",
            "unit": "ns/iter"
          },
          {
            "name": "export_identity",
            "value": 94772027,
            "range": "± 663715",
            "unit": "ns/iter"
          },
          {
            "name": "import_identity",
            "value": 95274930,
            "range": "± 688907",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_1mib",
            "value": 390053,
            "range": "± 397",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/4",
            "value": 6140451,
            "range": "± 918045",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/8",
            "value": 67245901,
            "range": "± 56706845",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/10",
            "value": 448948227,
            "range": "± 300873654",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/12",
            "value": 1761349675,
            "range": "± 3110246274",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_64mib",
            "value": 100014715,
            "range": "± 1239101",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_mobile",
            "value": 99735581,
            "range": "± 341098",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/test_1mib",
            "value": 390544,
            "range": "± 352",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/mobile_64mib_p2",
            "value": 98865667,
            "range": "± 608277",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/prod_64mib_p4",
            "value": 99940687,
            "range": "± 760483",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/100",
            "value": 1526331,
            "range": "± 28014",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/500",
            "value": 5229262,
            "range": "± 105837",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/1000",
            "value": 10231555,
            "range": "± 57771",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/100",
            "value": 221,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/1000",
            "value": 236,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/5000",
            "value": 303,
            "range": "± 7",
            "unit": "ns/iter"
          },
          {
            "name": "insert_with_branch/insert_default_threshold",
            "value": 22272,
            "range": "± 1545",
            "unit": "ns/iter"
          },
          {
            "name": "insert_with_branch/insert_small_threshold",
            "value": 93885,
            "range": "± 11725",
            "unit": "ns/iter"
          },
          {
            "name": "space_state_lookup/get_space_branch_state",
            "value": 235,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "hash_branch_matching/assign_branch_unfractured",
            "value": 221,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "hash_branch_matching/assign_branch_fractured",
            "value": 245,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/2MB",
            "value": 1735521,
            "range": "± 5740",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/10MB",
            "value": 11692517,
            "range": "± 187624",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/50MB",
            "value": 62089153,
            "range": "± 179468",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/100MB",
            "value": 124757625,
            "range": "± 279563",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/2MB",
            "value": 3334172,
            "range": "± 31164",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/10MB",
            "value": 16770166,
            "range": "± 127714",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/50MB",
            "value": 103117358,
            "range": "± 752506",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/2MB",
            "value": 1838537,
            "range": "± 1290",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/10MB",
            "value": 9321919,
            "range": "± 9570",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/50MB",
            "value": 52000085,
            "range": "± 383241",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/2",
            "value": 783,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/10",
            "value": 3466,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/50",
            "value": 15637,
            "range": "± 22",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/100",
            "value": 33919,
            "range": "± 38",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/500",
            "value": 150078,
            "range": "± 110",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/1024",
            "value": 305895,
            "range": "± 267",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/2",
            "value": 828,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/10",
            "value": 3648,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/50",
            "value": 17052,
            "range": "± 15",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/100",
            "value": 34053,
            "range": "± 51",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/500",
            "value": 165722,
            "range": "± 126",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/1024",
            "value": 337475,
            "range": "± 249",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/1MB",
            "value": 889466,
            "range": "± 1030",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/10MB",
            "value": 8806187,
            "range": "± 28635",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/100MB",
            "value": 124861247,
            "range": "± 240213",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/500MB",
            "value": 612615001,
            "range": "± 1468854",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/1024MB",
            "value": 1267177319,
            "range": "± 1273397",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/10",
            "value": 19618,
            "range": "± 26",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/50",
            "value": 79413,
            "range": "± 110",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/100",
            "value": 154052,
            "range": "± 176",
            "unit": "ns/iter"
          },
          {
            "name": "decay_simulation/10k_posts_60_days",
            "value": 18328828,
            "range": "± 195098",
            "unit": "ns/iter"
          },
          {
            "name": "decay_simulation_large/100k_posts_60_days",
            "value": 227362598,
            "range": "± 1641743",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/1000",
            "value": 37,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/10000",
            "value": 59657,
            "range": "± 1732",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/50000",
            "value": 356027,
            "range": "± 3164",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/100",
            "value": 30272,
            "range": "± 22",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/1000",
            "value": 330672,
            "range": "± 173",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/10000",
            "value": 3219368,
            "range": "± 4037",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/100000",
            "value": 32105419,
            "range": "± 26144",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/1000",
            "value": 1832,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/10000",
            "value": 14489,
            "range": "± 10",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/100000",
            "value": 259991,
            "range": "± 219",
            "unit": "ns/iter"
          },
          {
            "name": "header_hash",
            "value": 327,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "meets_difficulty",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Budget_1GB",
            "value": 2961087,
            "range": "± 12424",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Standard_5GB",
            "value": 15419401,
            "range": "± 83367",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Flagship_10GB",
            "value": 31825986,
            "range": "± 945100",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/50",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/75",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/90",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/95",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/99",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/1KB",
            "value": 409166,
            "range": "± 66372",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/10KB",
            "value": 418714,
            "range": "± 35948",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/100KB",
            "value": 624371,
            "range": "± 84023",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/100",
            "value": 1398,
            "range": "± 13",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/1000",
            "value": 16229,
            "range": "± 236",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/10000",
            "value": 211478,
            "range": "± 2528",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/steady_state",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/daily_growth",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/avg_post_size",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/10_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/100_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/1000_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/10000_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/budget_1gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/standard_5gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/flagship_10gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/root_block",
            "value": 4690,
            "range": "± 397",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/space_block",
            "value": 620,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/content_block",
            "value": 600,
            "range": "± 5",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/1024",
            "value": 8789,
            "range": "± 7744",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/4096",
            "value": 14255,
            "range": "± 10148",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/65536",
            "value": 142926,
            "range": "± 59189",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/1048576",
            "value": 2064715,
            "range": "± 110553",
            "unit": "ns/iter"
          },
          {
            "name": "random_read/root_block_1000",
            "value": 694,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/1024_bytes",
            "value": 8582,
            "range": "± 6",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/65536_bytes",
            "value": 51959,
            "range": "± 67",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/1048576_bytes",
            "value": 731343,
            "range": "± 917",
            "unit": "ns/iter"
          },
          {
            "name": "cache/add_entry",
            "value": 560,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "cache/access",
            "value": 264,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/100",
            "value": 28612,
            "range": "± 156",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/1000",
            "value": 52847,
            "range": "± 477",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/10000",
            "value": 52932,
            "range": "± 1034",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/1048576_bytes",
            "value": 696124,
            "range": "± 1031",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/5242880_bytes",
            "value": 3499676,
            "range": "± 9484",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/10485760_bytes",
            "value": 7000758,
            "range": "± 17240",
            "unit": "ns/iter"
          },
          {
            "name": "startup/empty_db",
            "value": 2192507,
            "range": "± 37810",
            "unit": "ns/iter"
          },
          {
            "name": "startup/populated_db",
            "value": 6020972,
            "range": "± 31587",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/100",
            "value": 485001,
            "range": "± 11916",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/1000",
            "value": 610665,
            "range": "± 6343",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/10000",
            "value": 615730,
            "range": "± 16842",
            "unit": "ns/iter"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "admin@adminwizard.tech",
            "name": "AdminWizard"
          },
          "committer": {
            "email": "admin@adminwizard.tech",
            "name": "AdminWizard"
          },
          "distinct": true,
          "id": "aff7cbc7ba05c0e64993f72de09658d40a1b328e",
          "message": "feat(sims): real in-browser simulations of the three branching systems\n\nExtract the pure decision cores of frequency isolation, behavioral branching\n(SPEC_13), and size-based fracture (SPEC_08) into a new dependency-light\n`swimchain-core` crate — one source of truth compiled into BOTH the node and\nbrowser WASM, so the \"how it works\" pages run the genuine algorithm, not a JS\nre-implementation.\n\n- swimchain-core: frequency (derive/resolve/eligibility + evaluate_drift),\n  behavioral (real BFS cluster discovery + §2.1 metric formulas + §2.2 gates +\n  evaluate_cluster), fracture (50 MiB threshold + BranchPath hash-bit placement\n  + fracture). Unit-tested.\n- src/network/frequency.rs now re-exports swimchain_core::frequency (keeps the\n  node-only process-global FrequencyContext) — true single source, node lib +\n  core tests green.\n- swimchain-wasm exposes frequency_evaluate / behavioral_evaluate /\n  fracture_evaluate returning the real result structs.\n- website/sim-{frequency,behavioral,size}.html: interactive canvas sims driving\n  the WASM live; linked from the Protocol page mechanic cards. Verified running\n  in a headless browser.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>",
          "timestamp": "2026-07-12T14:44:08-04:00",
          "tree_id": "79f27a65adf242e7c89a3467a51f3c77e11bc70b",
          "url": "https://github.com/superness/swimchain/commit/aff7cbc7ba05c0e64993f72de09658d40a1b328e"
        },
        "date": 1783884189726,
        "tool": "cargo",
        "benches": [
          {
            "name": "mobile_single_hash/mobile_64mib_p2",
            "value": 85413771,
            "range": "± 1023193",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_single_hash/desktop_64mib_p4",
            "value": 88686078,
            "range": "± 1273314",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_single_hash/test_1mib_p1",
            "value": 386275,
            "range": "± 3727",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/4",
            "value": 1430799471,
            "range": "± 916261226",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/6",
            "value": 3306609089,
            "range": "± 3484562990",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/8",
            "value": 18275266088,
            "range": "± 16106645644",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/4",
            "value": 6363195,
            "range": "± 1127104",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/6",
            "value": 24113967,
            "range": "± 11966415",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/8",
            "value": 75763233,
            "range": "± 39370945",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/10",
            "value": 210392160,
            "range": "± 178955109",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/12",
            "value": 1148095193,
            "range": "± 1075759626",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Post",
            "value": 1083689638,
            "range": "± 871263254",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Reply",
            "value": 507183000,
            "range": "± 2186206810",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Engage",
            "value": 696148508,
            "range": "± 582826479",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/3G_2mbps",
            "value": 3044200430,
            "range": "± 5945488",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/4G_10mbps",
            "value": 3838,
            "range": "± 85",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/WiFi_50mbps",
            "value": 3854,
            "range": "± 60",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/1KB",
            "value": 6115,
            "range": "± 68",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/4KB",
            "value": 1562,
            "range": "± 24",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/16KB",
            "value": 465,
            "range": "± 7",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/64KB",
            "value": 158,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "node_startup",
            "value": 2613511031,
            "range": "± 139752863",
            "unit": "ns/iter"
          },
          {
            "name": "node_shutdown",
            "value": 2356848375,
            "range": "± 4089559",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/2",
            "value": 4940769572,
            "range": "± 56732355",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/3",
            "value": 7418974578,
            "range": "± 135693827",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/5",
            "value": 12420352729,
            "range": "± 417267826",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/10",
            "value": 24925151224,
            "range": "± 527027249",
            "unit": "ns/iter"
          },
          {
            "name": "chain_store_access",
            "value": 11,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "connection_manager_access",
            "value": 11,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_info",
            "value": 88871,
            "range": "± 3493",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_sync_status",
            "value": 317020,
            "range": "± 10850",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_chain_stats",
            "value": 90441,
            "range": "± 2352",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_peers",
            "value": 82198,
            "range": "± 4070",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/list_spaces",
            "value": 84924,
            "range": "± 2683",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/feed_poll",
            "value": 504732,
            "range": "± 9593",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/create_space",
            "value": 11644333,
            "range": "± 9774819",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/submit_post",
            "value": 23563125,
            "range": "± 39327013",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/list_space_content_populated",
            "value": 1257340,
            "range": "± 39050",
            "unit": "ns/iter"
          },
          {
            "name": "keypair_generation",
            "value": 18695,
            "range": "± 84",
            "unit": "ns/iter"
          },
          {
            "name": "sign_32bytes",
            "value": 37046,
            "range": "± 15",
            "unit": "ns/iter"
          },
          {
            "name": "sign_1kb",
            "value": 41223,
            "range": "± 31",
            "unit": "ns/iter"
          },
          {
            "name": "verify_signature",
            "value": 40882,
            "range": "± 136",
            "unit": "ns/iter"
          },
          {
            "name": "encode_address",
            "value": 332,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decode_address",
            "value": 483,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/8",
            "value": 37022,
            "range": "± 443",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/12",
            "value": 311705,
            "range": "± 9937",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/16",
            "value": 4518307,
            "range": "± 787275",
            "unit": "ns/iter"
          },
          {
            "name": "encrypt_private_key",
            "value": 89579745,
            "range": "± 1108098",
            "unit": "ns/iter"
          },
          {
            "name": "decrypt_private_key",
            "value": 89659024,
            "range": "± 1480014",
            "unit": "ns/iter"
          },
          {
            "name": "export_identity",
            "value": 89765251,
            "range": "± 356196",
            "unit": "ns/iter"
          },
          {
            "name": "import_identity",
            "value": 89774906,
            "range": "± 2618223",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_1mib",
            "value": 391757,
            "range": "± 946",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/4",
            "value": 6114735,
            "range": "± 1269243",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/8",
            "value": 80847472,
            "range": "± 40472585",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/10",
            "value": 269661814,
            "range": "± 286239488",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/12",
            "value": 1651092687,
            "range": "± 1539538009",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_64mib",
            "value": 91207004,
            "range": "± 805247",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_mobile",
            "value": 90419497,
            "range": "± 799188",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/test_1mib",
            "value": 393730,
            "range": "± 2122",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/mobile_64mib_p2",
            "value": 91057483,
            "range": "± 1398632",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/prod_64mib_p4",
            "value": 90765314,
            "range": "± 350538",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/100",
            "value": 1813114,
            "range": "± 183768",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/500",
            "value": 5481112,
            "range": "± 86314",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/1000",
            "value": 10855292,
            "range": "± 135386",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/100",
            "value": 232,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/1000",
            "value": 247,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/5000",
            "value": 320,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "insert_with_branch/insert_default_threshold",
            "value": 23199,
            "range": "± 1479",
            "unit": "ns/iter"
          },
          {
            "name": "insert_with_branch/insert_small_threshold",
            "value": 98963,
            "range": "± 12924",
            "unit": "ns/iter"
          },
          {
            "name": "space_state_lookup/get_space_branch_state",
            "value": 232,
            "range": "± 5",
            "unit": "ns/iter"
          },
          {
            "name": "hash_branch_matching/assign_branch_unfractured",
            "value": 213,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "hash_branch_matching/assign_branch_fractured",
            "value": 251,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/2MB",
            "value": 1408185,
            "range": "± 2305",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/10MB",
            "value": 11361078,
            "range": "± 16986",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/50MB",
            "value": 57360012,
            "range": "± 191275",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/100MB",
            "value": 113539013,
            "range": "± 347335",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/2MB",
            "value": 2753279,
            "range": "± 26543",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/10MB",
            "value": 13772194,
            "range": "± 176530",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/50MB",
            "value": 90643166,
            "range": "± 516957",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/2MB",
            "value": 1498520,
            "range": "± 15486",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/10MB",
            "value": 7569780,
            "range": "± 45427",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/50MB",
            "value": 40454900,
            "range": "± 287121",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/2",
            "value": 743,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/10",
            "value": 3281,
            "range": "± 7",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/50",
            "value": 14926,
            "range": "± 21",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/100",
            "value": 29433,
            "range": "± 83",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/500",
            "value": 143777,
            "range": "± 216",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/1024",
            "value": 294185,
            "range": "± 280",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/2",
            "value": 843,
            "range": "± 9",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/10",
            "value": 3688,
            "range": "± 5",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/50",
            "value": 17404,
            "range": "± 433",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/100",
            "value": 34396,
            "range": "± 31",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/500",
            "value": 170340,
            "range": "± 170",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/1024",
            "value": 349067,
            "range": "± 277",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/1MB",
            "value": 701470,
            "range": "± 1444",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/10MB",
            "value": 7009785,
            "range": "± 71467",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/100MB",
            "value": 112933551,
            "range": "± 252195",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/500MB",
            "value": 562474343,
            "range": "± 5791109",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/1024MB",
            "value": 1157082510,
            "range": "± 5992716",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/10",
            "value": 33981,
            "range": "± 91",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/50",
            "value": 134240,
            "range": "± 158",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/100",
            "value": 259115,
            "range": "± 622",
            "unit": "ns/iter"
          },
          {
            "name": "decay_simulation/10k_posts_60_days",
            "value": 18938946,
            "range": "± 397603",
            "unit": "ns/iter"
          },
          {
            "name": "decay_simulation_large/100k_posts_60_days",
            "value": 213643097,
            "range": "± 2737832",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/1000",
            "value": 26,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/10000",
            "value": 53630,
            "range": "± 540",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/50000",
            "value": 242605,
            "range": "± 2475",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/100",
            "value": 29900,
            "range": "± 69",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/1000",
            "value": 314517,
            "range": "± 360",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/10000",
            "value": 2994281,
            "range": "± 21241",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/100000",
            "value": 30155276,
            "range": "± 17332",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/1000",
            "value": 1611,
            "range": "± 5",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/10000",
            "value": 19888,
            "range": "± 132",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/100000",
            "value": 155876,
            "range": "± 191",
            "unit": "ns/iter"
          },
          {
            "name": "header_hash",
            "value": 298,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "meets_difficulty",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Budget_1GB",
            "value": 2875587,
            "range": "± 35294",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Standard_5GB",
            "value": 15944122,
            "range": "± 166807",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Flagship_10GB",
            "value": 33950759,
            "range": "± 640538",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/50",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/75",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/90",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/95",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/99",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/1KB",
            "value": 335571,
            "range": "± 25037",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/10KB",
            "value": 370937,
            "range": "± 25299",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/100KB",
            "value": 572966,
            "range": "± 28138",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/100",
            "value": 1431,
            "range": "± 5",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/1000",
            "value": 15200,
            "range": "± 138",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/10000",
            "value": 224521,
            "range": "± 3058",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/steady_state",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/daily_growth",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/avg_post_size",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/10_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/100_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/1000_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/10000_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/budget_1gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/standard_5gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/flagship_10gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/root_block",
            "value": 5333,
            "range": "± 425",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/space_block",
            "value": 579,
            "range": "± 6",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/content_block",
            "value": 616,
            "range": "± 7",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/1024",
            "value": 8434,
            "range": "± 7170",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/4096",
            "value": 14409,
            "range": "± 8449",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/65536",
            "value": 153540,
            "range": "± 56550",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/1048576",
            "value": 2163945,
            "range": "± 89180",
            "unit": "ns/iter"
          },
          {
            "name": "random_read/root_block_1000",
            "value": 719,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/1024_bytes",
            "value": 10458,
            "range": "± 39",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/65536_bytes",
            "value": 60373,
            "range": "± 385",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/1048576_bytes",
            "value": 817206,
            "range": "± 992",
            "unit": "ns/iter"
          },
          {
            "name": "cache/add_entry",
            "value": 583,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "cache/access",
            "value": 277,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/100",
            "value": 30100,
            "range": "± 587",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/1000",
            "value": 52040,
            "range": "± 217",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/10000",
            "value": 52048,
            "range": "± 189",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/1048576_bytes",
            "value": 779938,
            "range": "± 159",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/5242880_bytes",
            "value": 3938533,
            "range": "± 16509",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/10485760_bytes",
            "value": 8009688,
            "range": "± 91792",
            "unit": "ns/iter"
          },
          {
            "name": "startup/empty_db",
            "value": 2220728,
            "range": "± 25443",
            "unit": "ns/iter"
          },
          {
            "name": "startup/populated_db",
            "value": 6854388,
            "range": "± 62073",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/100",
            "value": 434091,
            "range": "± 16013",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/1000",
            "value": 547951,
            "range": "± 34298",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/10000",
            "value": 570164,
            "range": "± 23557",
            "unit": "ns/iter"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "admin@adminwizard.tech",
            "name": "AdminWizard"
          },
          "committer": {
            "email": "admin@adminwizard.tech",
            "name": "AdminWizard"
          },
          "distinct": true,
          "id": "9796de45843cf9046d0e8238dc27fd2b1e32aaf4",
          "message": "revert(net): remove frequency isolation — stay on one shared chain\n\nAfter reasoning it through end to end, network-layer isolation was abandoned:\non one shared chain a node must sync the whole chain regardless of peers (and\nalready only hosts what it views), so \"frequency\" was cosmetic; genuine\nisolation needs a separate, weak, cheaply-51%-able chain; and universal action\nprocessing IS the shared validation that makes the chain trustless — the\n\"spam\" is the backbone, not a cost to optimize away.\n\nRemoves: src/network/frequency.rs + swimchain-core frequency module, the\nFrequencyContext, config FrequencyIsolationMode + fields, peer-selection\ndial-filter + VERSION advertisement + seed CAP_SEED tag, the on-chain\nFrequencyDrift action (0x10) + storage/apply/RPC, get_node_frequency /\nlist_frequency_drifts, the wasm frequency bindings, the /sim/frequency page +\nFREQUENCY_ISOLATION_DESIGN.md. Keeps behavioral, fracture, and the forkchoice\npartition/reconverge sim (renamed tests/partition_reconverge.rs). Decision log\nretained in SELF_ORGANIZING_SPLITS_NOTES.md.\n\nVerified: swimchain-core tests, cargo check --lib, partition_reconverge test,\nand wasm-pack build all green.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>",
          "timestamp": "2026-07-12T16:31:05-04:00",
          "tree_id": "2ace06132c141543189ad33838af135db7515bab",
          "url": "https://github.com/superness/swimchain/commit/9796de45843cf9046d0e8238dc27fd2b1e32aaf4"
        },
        "date": 1783889787982,
        "tool": "cargo",
        "benches": [
          {
            "name": "mobile_single_hash/mobile_64mib_p2",
            "value": 98718958,
            "range": "± 3321514",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_single_hash/desktop_64mib_p4",
            "value": 100089774,
            "range": "± 3450764",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_single_hash/test_1mib_p1",
            "value": 389926,
            "range": "± 3844",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/4",
            "value": 1226123074,
            "range": "± 1715158338",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/6",
            "value": 4920483028,
            "range": "± 6515581980",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/8",
            "value": 7783839006,
            "range": "± 28328095059",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/4",
            "value": 6564136,
            "range": "± 963785",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/6",
            "value": 22253827,
            "range": "± 3887465",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/8",
            "value": 77621086,
            "range": "± 34211887",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/10",
            "value": 269496936,
            "range": "± 294203935",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/12",
            "value": 1548571195,
            "range": "± 1476314186",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Post",
            "value": 893680193,
            "range": "± 1106569707",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Reply",
            "value": 489278727,
            "range": "± 1469112093",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Engage",
            "value": 1152561485,
            "range": "± 833026576",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/3G_2mbps",
            "value": 3027868678,
            "range": "± 1363035",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/4G_10mbps",
            "value": 3289,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/WiFi_50mbps",
            "value": 3381,
            "range": "± 13",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/1KB",
            "value": 5182,
            "range": "± 19",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/4KB",
            "value": 1348,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/16KB",
            "value": 403,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/64KB",
            "value": 141,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "node_startup",
            "value": 2481689279,
            "range": "± 120016213",
            "unit": "ns/iter"
          },
          {
            "name": "node_shutdown",
            "value": 2356216554,
            "range": "± 3445393",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/2",
            "value": 4810088384,
            "range": "± 88686246",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/3",
            "value": 7265777570,
            "range": "± 67935944",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/5",
            "value": 12210499237,
            "range": "± 269089063",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/10",
            "value": 24364074212,
            "range": "± 354176304",
            "unit": "ns/iter"
          },
          {
            "name": "chain_store_access",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "connection_manager_access",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_info",
            "value": 143513,
            "range": "± 2596",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_sync_status",
            "value": 710494,
            "range": "± 22303",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_chain_stats",
            "value": 145271,
            "range": "± 1542",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_peers",
            "value": 134351,
            "range": "± 2986",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/list_spaces",
            "value": 137170,
            "range": "± 1479",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/feed_poll",
            "value": 1003177,
            "range": "± 7579",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/create_space",
            "value": 7418653,
            "range": "± 1132111",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/submit_post",
            "value": 19528395,
            "range": "± 2434924",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/list_space_content_populated",
            "value": 5098300,
            "range": "± 80150",
            "unit": "ns/iter"
          },
          {
            "name": "keypair_generation",
            "value": 18654,
            "range": "± 365",
            "unit": "ns/iter"
          },
          {
            "name": "sign_32bytes",
            "value": 37039,
            "range": "± 148",
            "unit": "ns/iter"
          },
          {
            "name": "sign_1kb",
            "value": 41207,
            "range": "± 80",
            "unit": "ns/iter"
          },
          {
            "name": "verify_signature",
            "value": 39852,
            "range": "± 125",
            "unit": "ns/iter"
          },
          {
            "name": "encode_address",
            "value": 332,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decode_address",
            "value": 482,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/8",
            "value": 37044,
            "range": "± 376",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/12",
            "value": 311057,
            "range": "± 20114",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/16",
            "value": 4473404,
            "range": "± 388892",
            "unit": "ns/iter"
          },
          {
            "name": "encrypt_private_key",
            "value": 92086700,
            "range": "± 472741",
            "unit": "ns/iter"
          },
          {
            "name": "decrypt_private_key",
            "value": 91128686,
            "range": "± 720296",
            "unit": "ns/iter"
          },
          {
            "name": "export_identity",
            "value": 92229331,
            "range": "± 573412",
            "unit": "ns/iter"
          },
          {
            "name": "import_identity",
            "value": 91310523,
            "range": "± 787494",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_1mib",
            "value": 394368,
            "range": "± 720",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/4",
            "value": 6064354,
            "range": "± 1132792",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/8",
            "value": 78445192,
            "range": "± 68040572",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/10",
            "value": 444103465,
            "range": "± 315883818",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/12",
            "value": 975745700,
            "range": "± 656513439",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_64mib",
            "value": 95479060,
            "range": "± 626412",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_mobile",
            "value": 94287306,
            "range": "± 332311",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/test_1mib",
            "value": 392078,
            "range": "± 6034",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/mobile_64mib_p2",
            "value": 92821600,
            "range": "± 1634788",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/prod_64mib_p4",
            "value": 91170026,
            "range": "± 1029838",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/100",
            "value": 2182803,
            "range": "± 185321",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/500",
            "value": 5557035,
            "range": "± 94476",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/1000",
            "value": 10920609,
            "range": "± 285561",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/100",
            "value": 234,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/1000",
            "value": 245,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/5000",
            "value": 319,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "insert_with_branch/insert_default_threshold",
            "value": 23061,
            "range": "± 1485",
            "unit": "ns/iter"
          },
          {
            "name": "insert_with_branch/insert_small_threshold",
            "value": 98575,
            "range": "± 13126",
            "unit": "ns/iter"
          },
          {
            "name": "space_state_lookup/get_space_branch_state",
            "value": 228,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "hash_branch_matching/assign_branch_unfractured",
            "value": 211,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "hash_branch_matching/assign_branch_fractured",
            "value": 248,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/2MB",
            "value": 1395205,
            "range": "± 6488",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/10MB",
            "value": 11174060,
            "range": "± 85161",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/50MB",
            "value": 56773014,
            "range": "± 83324",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/100MB",
            "value": 113753012,
            "range": "± 179203",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/2MB",
            "value": 2750762,
            "range": "± 26637",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/10MB",
            "value": 13853749,
            "range": "± 251659",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/50MB",
            "value": 91103727,
            "range": "± 1111025",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/2MB",
            "value": 1497854,
            "range": "± 2112",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/10MB",
            "value": 7509098,
            "range": "± 64260",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/50MB",
            "value": 40188864,
            "range": "± 176693",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/2",
            "value": 754,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/10",
            "value": 3295,
            "range": "± 5",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/50",
            "value": 14821,
            "range": "± 20",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/100",
            "value": 29061,
            "range": "± 18",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/500",
            "value": 143098,
            "range": "± 2117",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/1024",
            "value": 291306,
            "range": "± 5024",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/2",
            "value": 847,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/10",
            "value": 3690,
            "range": "± 15",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/50",
            "value": 17460,
            "range": "± 28",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/100",
            "value": 34497,
            "range": "± 47",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/500",
            "value": 170468,
            "range": "± 818",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/1024",
            "value": 349014,
            "range": "± 266",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/1MB",
            "value": 699755,
            "range": "± 2134",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/10MB",
            "value": 7107706,
            "range": "± 62447",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/100MB",
            "value": 109185293,
            "range": "± 270816",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/500MB",
            "value": 561170652,
            "range": "± 2058810",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/1024MB",
            "value": 1154873969,
            "range": "± 6023842",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/10",
            "value": 33822,
            "range": "± 72",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/50",
            "value": 134781,
            "range": "± 1449",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/100",
            "value": 260565,
            "range": "± 281",
            "unit": "ns/iter"
          },
          {
            "name": "decay_simulation/10k_posts_60_days",
            "value": 16815123,
            "range": "± 1356263",
            "unit": "ns/iter"
          },
          {
            "name": "decay_simulation_large/100k_posts_60_days",
            "value": 211616712,
            "range": "± 2087145",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/1000",
            "value": 28,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/10000",
            "value": 53925,
            "range": "± 779",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/50000",
            "value": 242025,
            "range": "± 3268",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/100",
            "value": 29459,
            "range": "± 157",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/1000",
            "value": 299785,
            "range": "± 2645",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/10000",
            "value": 2961822,
            "range": "± 7825",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/100000",
            "value": 30276963,
            "range": "± 16783",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/1000",
            "value": 1632,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/10000",
            "value": 25760,
            "range": "± 64",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/100000",
            "value": 165991,
            "range": "± 23920",
            "unit": "ns/iter"
          },
          {
            "name": "header_hash",
            "value": 298,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "meets_difficulty",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Budget_1GB",
            "value": 2859085,
            "range": "± 54763",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Standard_5GB",
            "value": 15758058,
            "range": "± 195745",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Flagship_10GB",
            "value": 32588617,
            "range": "± 422208",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/50",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/75",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/90",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/95",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/99",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/1KB",
            "value": 335743,
            "range": "± 34369",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/10KB",
            "value": 361880,
            "range": "± 26101",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/100KB",
            "value": 572118,
            "range": "± 20941",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/100",
            "value": 1453,
            "range": "± 19",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/1000",
            "value": 15381,
            "range": "± 113",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/10000",
            "value": 229981,
            "range": "± 2404",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/steady_state",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/daily_growth",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/avg_post_size",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/10_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/100_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/1000_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/10000_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/budget_1gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/standard_5gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/flagship_10gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/root_block",
            "value": 5028,
            "range": "± 450",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/space_block",
            "value": 586,
            "range": "± 10",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/content_block",
            "value": 617,
            "range": "± 10",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/1024",
            "value": 6647,
            "range": "± 3864",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/4096",
            "value": 13781,
            "range": "± 8302",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/65536",
            "value": 154191,
            "range": "± 52889",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/1048576",
            "value": 2163500,
            "range": "± 147811",
            "unit": "ns/iter"
          },
          {
            "name": "random_read/root_block_1000",
            "value": 751,
            "range": "± 5",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/1024_bytes",
            "value": 10428,
            "range": "± 35",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/65536_bytes",
            "value": 59899,
            "range": "± 286",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/1048576_bytes",
            "value": 809361,
            "range": "± 1258",
            "unit": "ns/iter"
          },
          {
            "name": "cache/add_entry",
            "value": 506,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "cache/access",
            "value": 259,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/100",
            "value": 29049,
            "range": "± 120",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/1000",
            "value": 51069,
            "range": "± 222",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/10000",
            "value": 51227,
            "range": "± 438",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/1048576_bytes",
            "value": 780368,
            "range": "± 9635",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/5242880_bytes",
            "value": 3908495,
            "range": "± 13604",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/10485760_bytes",
            "value": 7882863,
            "range": "± 16295",
            "unit": "ns/iter"
          },
          {
            "name": "startup/empty_db",
            "value": 2132611,
            "range": "± 47491",
            "unit": "ns/iter"
          },
          {
            "name": "startup/populated_db",
            "value": 6597246,
            "range": "± 87621",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/100",
            "value": 413281,
            "range": "± 11947",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/1000",
            "value": 535562,
            "range": "± 43448",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/10000",
            "value": 522615,
            "range": "± 35170",
            "unit": "ns/iter"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "admin@adminwizard.tech",
            "name": "AdminWizard"
          },
          "committer": {
            "email": "admin@adminwizard.tech",
            "name": "AdminWizard"
          },
          "distinct": true,
          "id": "13c0c22f3f78d78f934ae1e52cba5b37c1e1f93f",
          "message": "fix(reputation): base score 100 is Normal, not Watched\n\nget_reputation_effect used a strict `> 100` cutoff for Normal, so every\nbrand-new identity — whose base score is exactly REPUTATION_BASE_SCORE (100)\n— fell one point short and displayed as \"Watched ⚠️\". Make the Normal cutoff\ninclusive (`>= 100`): base score reads Normal, and only a score that has\nactually dropped below base (from spam flags) is Watched. Update the doc\ntable and threshold tests (100 -> Normal, add 99 -> Watched).\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>",
          "timestamp": "2026-07-12T16:45:47-04:00",
          "tree_id": "27792ed2358629c039bff835da3517d84c7a4f20",
          "url": "https://github.com/superness/swimchain/commit/13c0c22f3f78d78f934ae1e52cba5b37c1e1f93f"
        },
        "date": 1783891453321,
        "tool": "cargo",
        "benches": [
          {
            "name": "mobile_single_hash/mobile_64mib_p2",
            "value": 96713330,
            "range": "± 830019",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_single_hash/desktop_64mib_p4",
            "value": 96614550,
            "range": "± 2561395",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_single_hash/test_1mib_p1",
            "value": 389567,
            "range": "± 334",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/4",
            "value": 1891702220,
            "range": "± 1340531945",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/6",
            "value": 9647922670,
            "range": "± 7451273914",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/8",
            "value": 8135738736,
            "range": "± 33189790008",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/4",
            "value": 6076967,
            "range": "± 590480",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/6",
            "value": 25491806,
            "range": "± 7250070",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/8",
            "value": 75172404,
            "range": "± 37291421",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/10",
            "value": 303939347,
            "range": "± 497563890",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/12",
            "value": 1218418931,
            "range": "± 2412678926",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Post",
            "value": 882659294,
            "range": "± 2413566770",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Reply",
            "value": 1073231894,
            "range": "± 1627577186",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Engage",
            "value": 1664682237,
            "range": "± 935361980",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/3G_2mbps",
            "value": 3035089249,
            "range": "± 1577326",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/4G_10mbps",
            "value": 3289,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/WiFi_50mbps",
            "value": 3381,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/1KB",
            "value": 5180,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/4KB",
            "value": 1348,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/16KB",
            "value": 403,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/64KB",
            "value": 141,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "node_startup",
            "value": 2417633565,
            "range": "± 66681346",
            "unit": "ns/iter"
          },
          {
            "name": "node_shutdown",
            "value": 2356835046,
            "range": "± 3431004",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/2",
            "value": 4863886621,
            "range": "± 74597845",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/3",
            "value": 7328631998,
            "range": "± 141767954",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/5",
            "value": 12083578630,
            "range": "± 112634063",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/10",
            "value": 24224573432,
            "range": "± 315782835",
            "unit": "ns/iter"
          },
          {
            "name": "chain_store_access",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "connection_manager_access",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_info",
            "value": 146775,
            "range": "± 6365",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_sync_status",
            "value": 711950,
            "range": "± 10988",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_chain_stats",
            "value": 149864,
            "range": "± 2127",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_peers",
            "value": 138441,
            "range": "± 5071",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/list_spaces",
            "value": 140043,
            "range": "± 4904",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/feed_poll",
            "value": 1009549,
            "range": "± 15356",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/create_space",
            "value": 7497473,
            "range": "± 1064481",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/submit_post",
            "value": 19573429,
            "range": "± 1779437",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/list_space_content_populated",
            "value": 6021564,
            "range": "± 102016",
            "unit": "ns/iter"
          },
          {
            "name": "keypair_generation",
            "value": 16252,
            "range": "± 105",
            "unit": "ns/iter"
          },
          {
            "name": "sign_32bytes",
            "value": 31948,
            "range": "± 19",
            "unit": "ns/iter"
          },
          {
            "name": "sign_1kb",
            "value": 35430,
            "range": "± 644",
            "unit": "ns/iter"
          },
          {
            "name": "verify_signature",
            "value": 39649,
            "range": "± 64",
            "unit": "ns/iter"
          },
          {
            "name": "encode_address",
            "value": 281,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "decode_address",
            "value": 411,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/8",
            "value": 31528,
            "range": "± 188",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/12",
            "value": 258953,
            "range": "± 5594",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/16",
            "value": 3931556,
            "range": "± 786725",
            "unit": "ns/iter"
          },
          {
            "name": "encrypt_private_key",
            "value": 74267092,
            "range": "± 811507",
            "unit": "ns/iter"
          },
          {
            "name": "decrypt_private_key",
            "value": 75548966,
            "range": "± 1427591",
            "unit": "ns/iter"
          },
          {
            "name": "export_identity",
            "value": 75374291,
            "range": "± 1130795",
            "unit": "ns/iter"
          },
          {
            "name": "import_identity",
            "value": 74561657,
            "range": "± 2271885",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_1mib",
            "value": 310650,
            "range": "± 3643",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/4",
            "value": 4915475,
            "range": "± 562057",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/8",
            "value": 67479939,
            "range": "± 26077898",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/10",
            "value": 249274613,
            "range": "± 175833895",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/12",
            "value": 1881310085,
            "range": "± 1321614484",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_64mib",
            "value": 79080431,
            "range": "± 757356",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_mobile",
            "value": 77634004,
            "range": "± 725933",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/test_1mib",
            "value": 307271,
            "range": "± 306",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/mobile_64mib_p2",
            "value": 77300765,
            "range": "± 681374",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/prod_64mib_p4",
            "value": 78642676,
            "range": "± 705958",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/100",
            "value": 4517820,
            "range": "± 3225120",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/500",
            "value": 9900405,
            "range": "± 4064017",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/1000",
            "value": 12799570,
            "range": "± 6642655",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/100",
            "value": 203,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/1000",
            "value": 208,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/5000",
            "value": 266,
            "range": "± 7",
            "unit": "ns/iter"
          },
          {
            "name": "insert_with_branch/insert_default_threshold",
            "value": 17234,
            "range": "± 1217",
            "unit": "ns/iter"
          },
          {
            "name": "insert_with_branch/insert_small_threshold",
            "value": 79318,
            "range": "± 13736",
            "unit": "ns/iter"
          },
          {
            "name": "space_state_lookup/get_space_branch_state",
            "value": 202,
            "range": "± 8",
            "unit": "ns/iter"
          },
          {
            "name": "hash_branch_matching/assign_branch_unfractured",
            "value": 187,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "hash_branch_matching/assign_branch_fractured",
            "value": 227,
            "range": "± 7",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/2MB",
            "value": 1200945,
            "range": "± 292",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/10MB",
            "value": 9855740,
            "range": "± 113281",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/50MB",
            "value": 51740072,
            "range": "± 195110",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/100MB",
            "value": 103611554,
            "range": "± 615702",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/2MB",
            "value": 2748488,
            "range": "± 935415",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/10MB",
            "value": 13309547,
            "range": "± 3078648",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/50MB",
            "value": 90270778,
            "range": "± 32329684",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/2MB",
            "value": 1302499,
            "range": "± 1431",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/10MB",
            "value": 6505490,
            "range": "± 12811",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/50MB",
            "value": 34257780,
            "range": "± 297499",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/2",
            "value": 586,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/10",
            "value": 2321,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/50",
            "value": 10373,
            "range": "± 5",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/100",
            "value": 20175,
            "range": "± 17",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/500",
            "value": 98276,
            "range": "± 992",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/1024",
            "value": 201467,
            "range": "± 298",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/2",
            "value": 673,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/10",
            "value": 2890,
            "range": "± 5",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/50",
            "value": 13680,
            "range": "± 34",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/100",
            "value": 26997,
            "range": "± 13",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/500",
            "value": 132851,
            "range": "± 76",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/1024",
            "value": 271880,
            "range": "± 3995",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/1MB",
            "value": 601138,
            "range": "± 2939",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/10MB",
            "value": 6071932,
            "range": "± 13148",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/100MB",
            "value": 104409836,
            "range": "± 344777",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/500MB",
            "value": 514377060,
            "range": "± 5535134",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/1024MB",
            "value": 1059720885,
            "range": "± 13188819",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/10",
            "value": 29263,
            "range": "± 181",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/50",
            "value": 112209,
            "range": "± 261",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/100",
            "value": 214632,
            "range": "± 268",
            "unit": "ns/iter"
          },
          {
            "name": "decay_simulation/10k_posts_60_days",
            "value": 14498211,
            "range": "± 362847",
            "unit": "ns/iter"
          },
          {
            "name": "decay_simulation_large/100k_posts_60_days",
            "value": 190500888,
            "range": "± 2203506",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/1000",
            "value": 24,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/10000",
            "value": 38467,
            "range": "± 211",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/50000",
            "value": 170597,
            "range": "± 2209",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/100",
            "value": 25180,
            "range": "± 191",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/1000",
            "value": 254570,
            "range": "± 369",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/10000",
            "value": 2560862,
            "range": "± 1773",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/100000",
            "value": 25575053,
            "range": "± 20778",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/1000",
            "value": 1526,
            "range": "± 23",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/10000",
            "value": 14316,
            "range": "± 14",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/100000",
            "value": 122670,
            "range": "± 277",
            "unit": "ns/iter"
          },
          {
            "name": "header_hash",
            "value": 255,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "meets_difficulty",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Budget_1GB",
            "value": 2918524,
            "range": "± 18986",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Standard_5GB",
            "value": 16206255,
            "range": "± 240327",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Flagship_10GB",
            "value": 34748583,
            "range": "± 838122",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/50",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/75",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/90",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/95",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/99",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/1KB",
            "value": 447905,
            "range": "± 28405",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/10KB",
            "value": 516246,
            "range": "± 46680",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/100KB",
            "value": 738679,
            "range": "± 132287",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/100",
            "value": 1401,
            "range": "± 8",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/1000",
            "value": 15947,
            "range": "± 319",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/10000",
            "value": 213402,
            "range": "± 1454",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/steady_state",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/daily_growth",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/avg_post_size",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/10_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/100_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/1000_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/10000_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/budget_1gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/standard_5gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/flagship_10gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/root_block",
            "value": 5409,
            "range": "± 575",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/space_block",
            "value": 628,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/content_block",
            "value": 592,
            "range": "± 7",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/1024",
            "value": 9802,
            "range": "± 10094",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/4096",
            "value": 18824,
            "range": "± 17147",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/65536",
            "value": 155984,
            "range": "± 74114",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/1048576",
            "value": 2210341,
            "range": "± 102533",
            "unit": "ns/iter"
          },
          {
            "name": "random_read/root_block_1000",
            "value": 695,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/1024_bytes",
            "value": 8570,
            "range": "± 20",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/65536_bytes",
            "value": 52760,
            "range": "± 133",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/1048576_bytes",
            "value": 736833,
            "range": "± 1844",
            "unit": "ns/iter"
          },
          {
            "name": "cache/add_entry",
            "value": 568,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "cache/access",
            "value": 269,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/100",
            "value": 29352,
            "range": "± 128",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/1000",
            "value": 53879,
            "range": "± 269",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/10000",
            "value": 54082,
            "range": "± 321",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/1048576_bytes",
            "value": 705282,
            "range": "± 752",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/5242880_bytes",
            "value": 3550164,
            "range": "± 4436",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/10485760_bytes",
            "value": 7206856,
            "range": "± 9014",
            "unit": "ns/iter"
          },
          {
            "name": "startup/empty_db",
            "value": 2446190,
            "range": "± 42643",
            "unit": "ns/iter"
          },
          {
            "name": "startup/populated_db",
            "value": 6719869,
            "range": "± 172245",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/100",
            "value": 529900,
            "range": "± 27380",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/1000",
            "value": 673629,
            "range": "± 19808",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/10000",
            "value": 662264,
            "range": "± 13395",
            "unit": "ns/iter"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "admin@adminwizard.tech",
            "name": "AdminWizard"
          },
          "committer": {
            "email": "admin@adminwizard.tech",
            "name": "AdminWizard"
          },
          "distinct": true,
          "id": "7a9e643dadbeedccd5b6271cd1b2e5f8e79d7d0c",
          "message": "feat(swim-auto): `fresh` command to run a non-genesis identity node\n\nAdds `swim-auto fresh [name]` — mints a fresh testnet identity into its own\ndata dir and starts a node on alt ports (19745/19746) that coexists with the\ngenesis node, then prints the SWIM_AUTO_NODE_RPC/DATADIR to point the harness\n(and, by --data-dir, the launcher) at it. `fresh stop [name]` tears it down.\n\nLets us drive apps as a brand-new user instead of the genesis/\"Super\" identity.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>",
          "timestamp": "2026-07-12T19:11:05-04:00",
          "tree_id": "27a78847494e17dec0e44d13f5f1d9f42362cab7",
          "url": "https://github.com/superness/swimchain/commit/7a9e643dadbeedccd5b6271cd1b2e5f8e79d7d0c"
        },
        "date": 1783899407534,
        "tool": "cargo",
        "benches": [
          {
            "name": "mobile_single_hash/mobile_64mib_p2",
            "value": 104235386,
            "range": "± 565195",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_single_hash/desktop_64mib_p4",
            "value": 104566847,
            "range": "± 632560",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_single_hash/test_1mib_p1",
            "value": 390080,
            "range": "± 510",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/4",
            "value": 677560480,
            "range": "± 1971504694",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/6",
            "value": 5013887883,
            "range": "± 7398420416",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/8",
            "value": 15428321066,
            "range": "± 22266997439",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/4",
            "value": 6257119,
            "range": "± 1109925",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/6",
            "value": 24661700,
            "range": "± 10754717",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/8",
            "value": 104013059,
            "range": "± 34678389",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/10",
            "value": 437089686,
            "range": "± 254810972",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/12",
            "value": 1399198376,
            "range": "± 1194736093",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Post",
            "value": 1244335672,
            "range": "± 2044435344",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Reply",
            "value": 1710489644,
            "range": "± 1564793284",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Engage",
            "value": 784000927,
            "range": "± 1115419231",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/3G_2mbps",
            "value": 3038641273,
            "range": "± 1313712",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/4G_10mbps",
            "value": 3387,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/WiFi_50mbps",
            "value": 3384,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/1KB",
            "value": 5314,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/4KB",
            "value": 1373,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/16KB",
            "value": 402,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/64KB",
            "value": 138,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "node_startup",
            "value": 2441618103,
            "range": "± 61657501",
            "unit": "ns/iter"
          },
          {
            "name": "node_shutdown",
            "value": 2357546432,
            "range": "± 2590616",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/2",
            "value": 4866953517,
            "range": "± 69926476",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/3",
            "value": 7236461114,
            "range": "± 53679297",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/5",
            "value": 12066541681,
            "range": "± 351108952",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/10",
            "value": 24068711084,
            "range": "± 286828692",
            "unit": "ns/iter"
          },
          {
            "name": "chain_store_access",
            "value": 12,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "connection_manager_access",
            "value": 12,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_info",
            "value": 97267,
            "range": "± 2764",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_sync_status",
            "value": 331792,
            "range": "± 16197",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_chain_stats",
            "value": 98202,
            "range": "± 2412",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_peers",
            "value": 90702,
            "range": "± 1485",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/list_spaces",
            "value": 92872,
            "range": "± 3066",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/feed_poll",
            "value": 539891,
            "range": "± 9014",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/create_space",
            "value": 7044967,
            "range": "± 1135759",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/submit_post",
            "value": 18657381,
            "range": "± 1658593",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/list_space_content_populated",
            "value": 3993541,
            "range": "± 21876",
            "unit": "ns/iter"
          },
          {
            "name": "keypair_generation",
            "value": 18655,
            "range": "± 8",
            "unit": "ns/iter"
          },
          {
            "name": "sign_32bytes",
            "value": 37052,
            "range": "± 1062",
            "unit": "ns/iter"
          },
          {
            "name": "sign_1kb",
            "value": 41155,
            "range": "± 1991",
            "unit": "ns/iter"
          },
          {
            "name": "verify_signature",
            "value": 43635,
            "range": "± 30",
            "unit": "ns/iter"
          },
          {
            "name": "encode_address",
            "value": 333,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decode_address",
            "value": 481,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/8",
            "value": 36672,
            "range": "± 319",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/12",
            "value": 311853,
            "range": "± 10613",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/16",
            "value": 4916032,
            "range": "± 320977",
            "unit": "ns/iter"
          },
          {
            "name": "encrypt_private_key",
            "value": 87033852,
            "range": "± 174764",
            "unit": "ns/iter"
          },
          {
            "name": "decrypt_private_key",
            "value": 86675897,
            "range": "± 996135",
            "unit": "ns/iter"
          },
          {
            "name": "export_identity",
            "value": 86986545,
            "range": "± 84207",
            "unit": "ns/iter"
          },
          {
            "name": "import_identity",
            "value": 86919388,
            "range": "± 138058",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_1mib",
            "value": 389998,
            "range": "± 178",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/4",
            "value": 6704735,
            "range": "± 1168481",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/8",
            "value": 93332658,
            "range": "± 76957393",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/10",
            "value": 207749536,
            "range": "± 487687265",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/12",
            "value": 837525313,
            "range": "± 974536891",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_64mib",
            "value": 89688631,
            "range": "± 378012",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_mobile",
            "value": 88581299,
            "range": "± 123834",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/test_1mib",
            "value": 390767,
            "range": "± 467",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/mobile_64mib_p2",
            "value": 88513383,
            "range": "± 96430",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/prod_64mib_p4",
            "value": 89442175,
            "range": "± 151047",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/100",
            "value": 1717206,
            "range": "± 312890",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/500",
            "value": 5264658,
            "range": "± 34196",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/1000",
            "value": 10279584,
            "range": "± 33869",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/100",
            "value": 234,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/1000",
            "value": 244,
            "range": "± 6",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/5000",
            "value": 317,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "insert_with_branch/insert_default_threshold",
            "value": 22521,
            "range": "± 1517",
            "unit": "ns/iter"
          },
          {
            "name": "insert_with_branch/insert_small_threshold",
            "value": 97675,
            "range": "± 12015",
            "unit": "ns/iter"
          },
          {
            "name": "space_state_lookup/get_space_branch_state",
            "value": 236,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "hash_branch_matching/assign_branch_unfractured",
            "value": 216,
            "range": "± 5",
            "unit": "ns/iter"
          },
          {
            "name": "hash_branch_matching/assign_branch_fractured",
            "value": 254,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/2MB",
            "value": 1394319,
            "range": "± 2340",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/10MB",
            "value": 10983982,
            "range": "± 92537",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/50MB",
            "value": 56992454,
            "range": "± 302622",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/100MB",
            "value": 113621238,
            "range": "± 377140",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/2MB",
            "value": 2743585,
            "range": "± 22745",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/10MB",
            "value": 13831959,
            "range": "± 111655",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/50MB",
            "value": 90227349,
            "range": "± 2414743",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/2MB",
            "value": 1510353,
            "range": "± 10698",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/10MB",
            "value": 7506691,
            "range": "± 66183",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/50MB",
            "value": 40212551,
            "range": "± 350872",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/2",
            "value": 775,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/10",
            "value": 3237,
            "range": "± 5",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/50",
            "value": 15112,
            "range": "± 28",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/100",
            "value": 29952,
            "range": "± 18",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/500",
            "value": 146320,
            "range": "± 1759",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/1024",
            "value": 298291,
            "range": "± 437",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/2",
            "value": 859,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/10",
            "value": 3763,
            "range": "± 12",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/50",
            "value": 18059,
            "range": "± 36",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/100",
            "value": 35136,
            "range": "± 74",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/500",
            "value": 173541,
            "range": "± 6581",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/1024",
            "value": 354851,
            "range": "± 750",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/1MB",
            "value": 704076,
            "range": "± 526",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/10MB",
            "value": 7393650,
            "range": "± 93449",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/100MB",
            "value": 111308660,
            "range": "± 285128",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/500MB",
            "value": 563294635,
            "range": "± 7096397",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/1024MB",
            "value": 1164242673,
            "range": "± 2140536",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/10",
            "value": 33955,
            "range": "± 44",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/50",
            "value": 134456,
            "range": "± 1026",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/100",
            "value": 259526,
            "range": "± 557",
            "unit": "ns/iter"
          },
          {
            "name": "decay_simulation/10k_posts_60_days",
            "value": 17169516,
            "range": "± 945005",
            "unit": "ns/iter"
          },
          {
            "name": "decay_simulation_large/100k_posts_60_days",
            "value": 213399027,
            "range": "± 1739460",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/1000",
            "value": 27,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/10000",
            "value": 53648,
            "range": "± 494",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/50000",
            "value": 242595,
            "range": "± 3176",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/100",
            "value": 29321,
            "range": "± 104",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/1000",
            "value": 301714,
            "range": "± 586",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/10000",
            "value": 2973138,
            "range": "± 96225",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/100000",
            "value": 30865899,
            "range": "± 111038",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/1000",
            "value": 1641,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/10000",
            "value": 25680,
            "range": "± 1630",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/100000",
            "value": 213532,
            "range": "± 5674",
            "unit": "ns/iter"
          },
          {
            "name": "header_hash",
            "value": 298,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "meets_difficulty",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Budget_1GB",
            "value": 2954185,
            "range": "± 19797",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Standard_5GB",
            "value": 15440411,
            "range": "± 197601",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Flagship_10GB",
            "value": 31212602,
            "range": "± 239644",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/50",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/75",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/90",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/95",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/99",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/1KB",
            "value": 430394,
            "range": "± 31362",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/10KB",
            "value": 477705,
            "range": "± 33092",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/100KB",
            "value": 668185,
            "range": "± 28472",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/100",
            "value": 1387,
            "range": "± 10",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/1000",
            "value": 15385,
            "range": "± 337",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/10000",
            "value": 211122,
            "range": "± 2287",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/steady_state",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/daily_growth",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/avg_post_size",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/10_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/100_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/1000_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/10000_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/budget_1gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/standard_5gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/flagship_10gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/root_block",
            "value": 5516,
            "range": "± 536",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/space_block",
            "value": 626,
            "range": "± 5",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/content_block",
            "value": 587,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/1024",
            "value": 10093,
            "range": "± 9608",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/4096",
            "value": 19156,
            "range": "± 18310",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/65536",
            "value": 163092,
            "range": "± 78104",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/1048576",
            "value": 2225305,
            "range": "± 99865",
            "unit": "ns/iter"
          },
          {
            "name": "random_read/root_block_1000",
            "value": 693,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/1024_bytes",
            "value": 8488,
            "range": "± 10",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/65536_bytes",
            "value": 52640,
            "range": "± 158",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/1048576_bytes",
            "value": 737802,
            "range": "± 1240",
            "unit": "ns/iter"
          },
          {
            "name": "cache/add_entry",
            "value": 567,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "cache/access",
            "value": 266,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/100",
            "value": 28435,
            "range": "± 162",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/1000",
            "value": 52565,
            "range": "± 259",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/10000",
            "value": 52777,
            "range": "± 209",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/1048576_bytes",
            "value": 704330,
            "range": "± 5138",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/5242880_bytes",
            "value": 3523829,
            "range": "± 6798",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/10485760_bytes",
            "value": 7101454,
            "range": "± 28825",
            "unit": "ns/iter"
          },
          {
            "name": "startup/empty_db",
            "value": 2312405,
            "range": "± 98240",
            "unit": "ns/iter"
          },
          {
            "name": "startup/populated_db",
            "value": 6278302,
            "range": "± 87173",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/100",
            "value": 554756,
            "range": "± 14992",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/1000",
            "value": 668837,
            "range": "± 14870",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/10000",
            "value": 671988,
            "range": "± 13109",
            "unit": "ns/iter"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "admin@adminwizard.tech",
            "name": "AdminWizard"
          },
          "committer": {
            "email": "admin@adminwizard.tech",
            "name": "AdminWizard"
          },
          "distinct": true,
          "id": "2608b1da3a55490973d92d5b0af884cbb4360d2d",
          "message": "fix(clients): converge action signing on the canonical preimage\n\nThe node now enforces per-action signatures. Every client signed a different,\nnon-canonical preimage (colon-strings, packed binary, JSON), so all six are\nconverged onto the one the node verifies: content_hash(32) || ts_LE(8) ||\nprivate(1). content_hash = sha256(title\\n\\nbody) for post, sha256(body) for\nreply/DM, conditional for edit. private byte set from the [PRIVATE:v1:]\nenvelope; timestamp is the exact submitted PoW timestamp. PoW and RPC-auth\nsigning untouched.\n\n- swimchain-react: new canonical signAction() helper (shared source of truth).\n- forum/chat/feed/wiki: post/reply/edit sign sites (+ chat channel-create and\n  DM-reply, which submit via post/reply and would break identically).\n- bridge, clients/swimchain-client: post/reply sign sites.\n\nAll six clients build clean.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>",
          "timestamp": "2026-07-12T19:38:33-04:00",
          "tree_id": "993dfbd30a2b3c0f05783ea0dd343e20f623a847",
          "url": "https://github.com/superness/swimchain/commit/2608b1da3a55490973d92d5b0af884cbb4360d2d"
        },
        "date": 1783900879650,
        "tool": "cargo",
        "benches": [
          {
            "name": "mobile_single_hash/mobile_64mib_p2",
            "value": 77233738,
            "range": "± 927443",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_single_hash/desktop_64mib_p4",
            "value": 76568264,
            "range": "± 797336",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_single_hash/test_1mib_p1",
            "value": 307834,
            "range": "± 225",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/4",
            "value": 1098445971,
            "range": "± 779794074",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/6",
            "value": 5185846527,
            "range": "± 6465347170",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/8",
            "value": 10400494757,
            "range": "± 11307231208",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/4",
            "value": 5073285,
            "range": "± 706879",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/6",
            "value": 19060292,
            "range": "± 9393202",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/8",
            "value": 92026395,
            "range": "± 63180006",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/10",
            "value": 215885246,
            "range": "± 220503638",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/12",
            "value": 1075219342,
            "range": "± 1186894602",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Post",
            "value": 1263685716,
            "range": "± 935378555",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Reply",
            "value": 1175979194,
            "range": "± 978135014",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Engage",
            "value": 1089224357,
            "range": "± 1320378953",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/3G_2mbps",
            "value": 3057768215,
            "range": "± 904378",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/4G_10mbps",
            "value": 2555,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/WiFi_50mbps",
            "value": 2571,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/1KB",
            "value": 4018,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/4KB",
            "value": 1047,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/16KB",
            "value": 313,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/64KB",
            "value": 109,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "node_startup",
            "value": 2523540710,
            "range": "± 121678868",
            "unit": "ns/iter"
          },
          {
            "name": "node_shutdown",
            "value": 2360305446,
            "range": "± 4519891",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/2",
            "value": 4884412774,
            "range": "± 58566460",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/3",
            "value": 7241786382,
            "range": "± 67380941",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/5",
            "value": 12112247847,
            "range": "± 200310109",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/10",
            "value": 24291410758,
            "range": "± 228208733",
            "unit": "ns/iter"
          },
          {
            "name": "chain_store_access",
            "value": 3,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "connection_manager_access",
            "value": 3,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_info",
            "value": 113041,
            "range": "± 1200",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_sync_status",
            "value": 548165,
            "range": "± 5487",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_chain_stats",
            "value": 115596,
            "range": "± 3194",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_peers",
            "value": 107606,
            "range": "± 1891",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/list_spaces",
            "value": 109097,
            "range": "± 2036",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/feed_poll",
            "value": 783657,
            "range": "± 10756",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/create_space",
            "value": 6238432,
            "range": "± 2402532",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/submit_post",
            "value": 17614538,
            "range": "± 1919369",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/list_space_content_populated",
            "value": 4240399,
            "range": "± 46415",
            "unit": "ns/iter"
          },
          {
            "name": "keypair_generation",
            "value": 18729,
            "range": "± 18",
            "unit": "ns/iter"
          },
          {
            "name": "sign_32bytes",
            "value": 37049,
            "range": "± 184",
            "unit": "ns/iter"
          },
          {
            "name": "sign_1kb",
            "value": 41230,
            "range": "± 31",
            "unit": "ns/iter"
          },
          {
            "name": "verify_signature",
            "value": 39619,
            "range": "± 75",
            "unit": "ns/iter"
          },
          {
            "name": "encode_address",
            "value": 332,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decode_address",
            "value": 482,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/8",
            "value": 37236,
            "range": "± 288",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/12",
            "value": 308440,
            "range": "± 5963",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/16",
            "value": 4834789,
            "range": "± 819562",
            "unit": "ns/iter"
          },
          {
            "name": "encrypt_private_key",
            "value": 95533048,
            "range": "± 416355",
            "unit": "ns/iter"
          },
          {
            "name": "decrypt_private_key",
            "value": 95926219,
            "range": "± 683729",
            "unit": "ns/iter"
          },
          {
            "name": "export_identity",
            "value": 95529691,
            "range": "± 371147",
            "unit": "ns/iter"
          },
          {
            "name": "import_identity",
            "value": 95872261,
            "range": "± 336366",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_1mib",
            "value": 388173,
            "range": "± 332",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/4",
            "value": 6501438,
            "range": "± 1077062",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/8",
            "value": 53190831,
            "range": "± 31182480",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/10",
            "value": 409788658,
            "range": "± 428431833",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/12",
            "value": 473730733,
            "range": "± 1271136953",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_64mib",
            "value": 97724164,
            "range": "± 249642",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_mobile",
            "value": 97981488,
            "range": "± 1342354",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/test_1mib",
            "value": 389929,
            "range": "± 1230",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/mobile_64mib_p2",
            "value": 97089691,
            "range": "± 472830",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/prod_64mib_p4",
            "value": 97541377,
            "range": "± 547772",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/100",
            "value": 1853757,
            "range": "± 46344",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/500",
            "value": 5899432,
            "range": "± 116143",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/1000",
            "value": 11556771,
            "range": "± 212369",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/100",
            "value": 233,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/1000",
            "value": 247,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/5000",
            "value": 319,
            "range": "± 5",
            "unit": "ns/iter"
          },
          {
            "name": "insert_with_branch/insert_default_threshold",
            "value": 24364,
            "range": "± 2055",
            "unit": "ns/iter"
          },
          {
            "name": "insert_with_branch/insert_small_threshold",
            "value": 102071,
            "range": "± 12607",
            "unit": "ns/iter"
          },
          {
            "name": "space_state_lookup/get_space_branch_state",
            "value": 227,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "hash_branch_matching/assign_branch_unfractured",
            "value": 211,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "hash_branch_matching/assign_branch_fractured",
            "value": 250,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/2MB",
            "value": 1385991,
            "range": "± 1953",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/10MB",
            "value": 11561813,
            "range": "± 29579",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/50MB",
            "value": 57837584,
            "range": "± 783689",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/100MB",
            "value": 114929167,
            "range": "± 446435",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/2MB",
            "value": 2740450,
            "range": "± 25259",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/10MB",
            "value": 14216736,
            "range": "± 161649",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/50MB",
            "value": 91852762,
            "range": "± 660291",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/2MB",
            "value": 1500746,
            "range": "± 3465",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/10MB",
            "value": 7897031,
            "range": "± 60665",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/50MB",
            "value": 40236963,
            "range": "± 112820",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/2",
            "value": 784,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/10",
            "value": 3186,
            "range": "± 7",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/50",
            "value": 14966,
            "range": "± 16",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/100",
            "value": 29417,
            "range": "± 62",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/500",
            "value": 143796,
            "range": "± 205",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/1024",
            "value": 294115,
            "range": "± 6670",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/2",
            "value": 859,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/10",
            "value": 3735,
            "range": "± 15",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/50",
            "value": 18002,
            "range": "± 45",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/100",
            "value": 35036,
            "range": "± 375",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/500",
            "value": 173251,
            "range": "± 1636",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/1024",
            "value": 353442,
            "range": "± 998",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/1MB",
            "value": 693936,
            "range": "± 316",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/10MB",
            "value": 7456698,
            "range": "± 8238",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/100MB",
            "value": 111738688,
            "range": "± 212193",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/500MB",
            "value": 566190419,
            "range": "± 3778650",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/1024MB",
            "value": 1173189312,
            "range": "± 1414301",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/10",
            "value": 33842,
            "range": "± 62",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/50",
            "value": 135233,
            "range": "± 122",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/100",
            "value": 260096,
            "range": "± 997",
            "unit": "ns/iter"
          },
          {
            "name": "decay_simulation/10k_posts_60_days",
            "value": 21876813,
            "range": "± 1073504",
            "unit": "ns/iter"
          },
          {
            "name": "decay_simulation_large/100k_posts_60_days",
            "value": 224623809,
            "range": "± 2156715",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/1000",
            "value": 25,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/10000",
            "value": 52834,
            "range": "± 549",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/50000",
            "value": 243465,
            "range": "± 3272",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/100",
            "value": 29212,
            "range": "± 106",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/1000",
            "value": 304208,
            "range": "± 952",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/10000",
            "value": 3057537,
            "range": "± 2809",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/100000",
            "value": 29791709,
            "range": "± 85935",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/1000",
            "value": 1646,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/10000",
            "value": 20360,
            "range": "± 18",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/100000",
            "value": 160765,
            "range": "± 1584",
            "unit": "ns/iter"
          },
          {
            "name": "header_hash",
            "value": 302,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "meets_difficulty",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Budget_1GB",
            "value": 2943928,
            "range": "± 11031",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Standard_5GB",
            "value": 16116461,
            "range": "± 355365",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Flagship_10GB",
            "value": 33336503,
            "range": "± 722795",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/50",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/75",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/90",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/95",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/99",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/1KB",
            "value": 426200,
            "range": "± 38278",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/10KB",
            "value": 466543,
            "range": "± 49985",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/100KB",
            "value": 689100,
            "range": "± 40056",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/100",
            "value": 1384,
            "range": "± 10",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/1000",
            "value": 16801,
            "range": "± 199",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/10000",
            "value": 218332,
            "range": "± 3585",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/steady_state",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/daily_growth",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/avg_post_size",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/10_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/100_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/1000_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/10000_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/budget_1gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/standard_5gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/flagship_10gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/root_block",
            "value": 6332,
            "range": "± 786",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/space_block",
            "value": 631,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/content_block",
            "value": 604,
            "range": "± 12",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/1024",
            "value": 16493,
            "range": "± 20138",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/4096",
            "value": 22649,
            "range": "± 21460",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/65536",
            "value": 170021,
            "range": "± 80506",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/1048576",
            "value": 2348333,
            "range": "± 197019",
            "unit": "ns/iter"
          },
          {
            "name": "random_read/root_block_1000",
            "value": 740,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/1024_bytes",
            "value": 8720,
            "range": "± 42",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/65536_bytes",
            "value": 54651,
            "range": "± 474",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/1048576_bytes",
            "value": 747426,
            "range": "± 1477",
            "unit": "ns/iter"
          },
          {
            "name": "cache/add_entry",
            "value": 561,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "cache/access",
            "value": 265,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/100",
            "value": 28638,
            "range": "± 137",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/1000",
            "value": 54481,
            "range": "± 407",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/10000",
            "value": 54866,
            "range": "± 214",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/1048576_bytes",
            "value": 703852,
            "range": "± 1106",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/5242880_bytes",
            "value": 3654103,
            "range": "± 5128",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/10485760_bytes",
            "value": 7325741,
            "range": "± 10438",
            "unit": "ns/iter"
          },
          {
            "name": "startup/empty_db",
            "value": 3063532,
            "range": "± 63649",
            "unit": "ns/iter"
          },
          {
            "name": "startup/populated_db",
            "value": 7913397,
            "range": "± 146331",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/100",
            "value": 616970,
            "range": "± 15339",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/1000",
            "value": 773241,
            "range": "± 32693",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/10000",
            "value": 742001,
            "range": "± 17846",
            "unit": "ns/iter"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "admin@adminwizard.tech",
            "name": "AdminWizard"
          },
          "committer": {
            "email": "admin@adminwizard.tech",
            "name": "AdminWizard"
          },
          "distinct": true,
          "id": "725b63a37e5da4849e5c5f2a3c767467dd40ca1e",
          "message": "fix(search): index content synced from peers, not just self-authored\n\nFull-text search returned nothing for content the node clearly held (e.g.\nlist_space_content showed 7 posts, yet search for a word in them returned 0).\nRoot cause: the Tantivy index was only written by submit_post/submit_reply\n(content THIS node authors), and both rebuild paths — the startup reindex and\nthe rebuild_search_index RPC — iterated content_store, which is EMPTY for\nsynced content. Content received from peers lives in the chain/block store +\nBlobStore (that's where list_space_content reads its bodies), so it was never\nindexed. Result: search only ever found posts you authored yourself.\n\nBoth rebuild paths now sweep chain_store.iter_content_blocks(), index Post/Reply\nactions (skipping private/encrypted content), and resolve each body the same way\nlist_space_content does (content_store body_inline -> get_body_by_hash ->\nBlobStore). Startup reindexes when the chain holds more content than the index.\n\nVerified on a clean-room node: startup logged \"Reindexing 12 content items from\nchain (index had 0)\" and search \"asdf\" now returns the matching post (was 0).\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>",
          "timestamp": "2026-07-12T19:48:15-04:00",
          "tree_id": "ca04004aebe47d2408c9543e2b6329298d43db99",
          "url": "https://github.com/superness/swimchain/commit/725b63a37e5da4849e5c5f2a3c767467dd40ca1e"
        },
        "date": 1783902444718,
        "tool": "cargo",
        "benches": [
          {
            "name": "mobile_single_hash/mobile_64mib_p2",
            "value": 97169483,
            "range": "± 300000",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_single_hash/desktop_64mib_p4",
            "value": 97034438,
            "range": "± 534537",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_single_hash/test_1mib_p1",
            "value": 396131,
            "range": "± 3172",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/4",
            "value": 1272378655,
            "range": "± 1683666074",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/6",
            "value": 2113265043,
            "range": "± 8133712224",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/8",
            "value": 15082474806,
            "range": "± 28719183013",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/4",
            "value": 6501626,
            "range": "± 631739",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/6",
            "value": 23296721,
            "range": "± 10745140",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/8",
            "value": 120225997,
            "range": "± 53570977",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/10",
            "value": 322294936,
            "range": "± 262529379",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/12",
            "value": 1577143387,
            "range": "± 954116555",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Post",
            "value": 735409833,
            "range": "± 1819207041",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Reply",
            "value": 970856183,
            "range": "± 1049636724",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Engage",
            "value": 1658261608,
            "range": "± 1281276556",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/3G_2mbps",
            "value": 3047296404,
            "range": "± 1815873",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/4G_10mbps",
            "value": 2989,
            "range": "± 6",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/WiFi_50mbps",
            "value": 2990,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/1KB",
            "value": 4718,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/4KB",
            "value": 1219,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/16KB",
            "value": 364,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/64KB",
            "value": 127,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "node_startup",
            "value": 2486443155,
            "range": "± 109536306",
            "unit": "ns/iter"
          },
          {
            "name": "node_shutdown",
            "value": 2358802723,
            "range": "± 2622876",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/2",
            "value": 4946842362,
            "range": "± 122852047",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/3",
            "value": 7224938341,
            "range": "± 35169754",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/5",
            "value": 12061289517,
            "range": "± 144131784",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/10",
            "value": 24061555328,
            "range": "± 162336242",
            "unit": "ns/iter"
          },
          {
            "name": "chain_store_access",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "connection_manager_access",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_info",
            "value": 168383,
            "range": "± 2402",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_sync_status",
            "value": 668767,
            "range": "± 5545",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_chain_stats",
            "value": 170619,
            "range": "± 4601",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_peers",
            "value": 163578,
            "range": "± 1418",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/list_spaces",
            "value": 163620,
            "range": "± 4077",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/feed_poll",
            "value": 1005930,
            "range": "± 9629",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/create_space",
            "value": 6736019,
            "range": "± 1139196",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/submit_post",
            "value": 21688783,
            "range": "± 1757693",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/list_space_content_populated",
            "value": 4966319,
            "range": "± 158231",
            "unit": "ns/iter"
          },
          {
            "name": "keypair_generation",
            "value": 20890,
            "range": "± 14",
            "unit": "ns/iter"
          },
          {
            "name": "sign_32bytes",
            "value": 41158,
            "range": "± 366",
            "unit": "ns/iter"
          },
          {
            "name": "sign_1kb",
            "value": 45613,
            "range": "± 34",
            "unit": "ns/iter"
          },
          {
            "name": "verify_signature",
            "value": 46990,
            "range": "± 36",
            "unit": "ns/iter"
          },
          {
            "name": "encode_address",
            "value": 360,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decode_address",
            "value": 529,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/8",
            "value": 40502,
            "range": "± 528",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/12",
            "value": 336666,
            "range": "± 7701",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/16",
            "value": 5186672,
            "range": "± 680078",
            "unit": "ns/iter"
          },
          {
            "name": "encrypt_private_key",
            "value": 94029538,
            "range": "± 873374",
            "unit": "ns/iter"
          },
          {
            "name": "decrypt_private_key",
            "value": 93633942,
            "range": "± 872069",
            "unit": "ns/iter"
          },
          {
            "name": "export_identity",
            "value": 93151214,
            "range": "± 311225",
            "unit": "ns/iter"
          },
          {
            "name": "import_identity",
            "value": 95045773,
            "range": "± 743127",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_1mib",
            "value": 390689,
            "range": "± 220",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/4",
            "value": 6311451,
            "range": "± 926407",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/8",
            "value": 95475812,
            "range": "± 64879523",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/10",
            "value": 339663324,
            "range": "± 161633453",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/12",
            "value": 1365587766,
            "range": "± 1733752475",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_64mib",
            "value": 99069406,
            "range": "± 390358",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_mobile",
            "value": 98137359,
            "range": "± 384465",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/test_1mib",
            "value": 390812,
            "range": "± 754",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/mobile_64mib_p2",
            "value": 98502044,
            "range": "± 295736",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/prod_64mib_p4",
            "value": 99446763,
            "range": "± 324801",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/100",
            "value": 1646584,
            "range": "± 12538",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/500",
            "value": 5593488,
            "range": "± 57719",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/1000",
            "value": 11052016,
            "range": "± 60355",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/100",
            "value": 260,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/1000",
            "value": 272,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/5000",
            "value": 350,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "insert_with_branch/insert_default_threshold",
            "value": 23547,
            "range": "± 1676",
            "unit": "ns/iter"
          },
          {
            "name": "insert_with_branch/insert_small_threshold",
            "value": 100709,
            "range": "± 12744",
            "unit": "ns/iter"
          },
          {
            "name": "space_state_lookup/get_space_branch_state",
            "value": 257,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "hash_branch_matching/assign_branch_unfractured",
            "value": 234,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "hash_branch_matching/assign_branch_fractured",
            "value": 286,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/2MB",
            "value": 1553048,
            "range": "± 590",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/10MB",
            "value": 13121681,
            "range": "± 34172",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/50MB",
            "value": 64980023,
            "range": "± 636468",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/100MB",
            "value": 130991736,
            "range": "± 634403",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/2MB",
            "value": 3081130,
            "range": "± 22140",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/10MB",
            "value": 15640558,
            "range": "± 120133",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/50MB",
            "value": 103452944,
            "range": "± 703931",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/2MB",
            "value": 1683322,
            "range": "± 1294",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/10MB",
            "value": 8524422,
            "range": "± 31247",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/50MB",
            "value": 44261463,
            "range": "± 83958",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/2",
            "value": 733,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/10",
            "value": 3006,
            "range": "± 32",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/50",
            "value": 13500,
            "range": "± 37",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/100",
            "value": 26574,
            "range": "± 32",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/500",
            "value": 129807,
            "range": "± 1711",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/1024",
            "value": 263330,
            "range": "± 534",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/2",
            "value": 869,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/10",
            "value": 3810,
            "range": "± 7",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/50",
            "value": 17892,
            "range": "± 89",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/100",
            "value": 35590,
            "range": "± 22",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/500",
            "value": 175514,
            "range": "± 416",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/1024",
            "value": 358722,
            "range": "± 373",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/1MB",
            "value": 777044,
            "range": "± 345",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/10MB",
            "value": 7985953,
            "range": "± 7816",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/100MB",
            "value": 127124105,
            "range": "± 932601",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/500MB",
            "value": 642188810,
            "range": "± 6836965",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/1024MB",
            "value": 1324483719,
            "range": "± 6690870",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/10",
            "value": 37803,
            "range": "± 76",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/50",
            "value": 149521,
            "range": "± 272",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/100",
            "value": 279185,
            "range": "± 420",
            "unit": "ns/iter"
          },
          {
            "name": "decay_simulation/10k_posts_60_days",
            "value": 20285427,
            "range": "± 1263085",
            "unit": "ns/iter"
          },
          {
            "name": "decay_simulation_large/100k_posts_60_days",
            "value": 234547784,
            "range": "± 11332543",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/1000",
            "value": 29,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/10000",
            "value": 49543,
            "range": "± 484",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/50000",
            "value": 221788,
            "range": "± 3226",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/100",
            "value": 32201,
            "range": "± 18",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/1000",
            "value": 333858,
            "range": "± 1291",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/10000",
            "value": 3260954,
            "range": "± 2876",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/100000",
            "value": 33105608,
            "range": "± 73236",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/1000",
            "value": 1806,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/10000",
            "value": 18465,
            "range": "± 36",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/100000",
            "value": 153448,
            "range": "± 416",
            "unit": "ns/iter"
          },
          {
            "name": "header_hash",
            "value": 333,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "meets_difficulty",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Budget_1GB",
            "value": 2203283,
            "range": "± 6327",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Standard_5GB",
            "value": 11827989,
            "range": "± 69693",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Flagship_10GB",
            "value": 24764524,
            "range": "± 1058740",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/50",
            "value": 3,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/75",
            "value": 3,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/90",
            "value": 3,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/95",
            "value": 3,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/99",
            "value": 3,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/1KB",
            "value": 457960,
            "range": "± 221574",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/10KB",
            "value": 597940,
            "range": "± 171673",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/100KB",
            "value": 662089,
            "range": "± 132617",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/100",
            "value": 1109,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/1000",
            "value": 11752,
            "range": "± 94",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/10000",
            "value": 171171,
            "range": "± 2444",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/steady_state",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/daily_growth",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/avg_post_size",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/10_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/100_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/1000_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/10000_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/budget_1gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/standard_5gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/flagship_10gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/root_block",
            "value": 3640,
            "range": "± 432",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/space_block",
            "value": 447,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/content_block",
            "value": 462,
            "range": "± 7",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/1024",
            "value": 11014,
            "range": "± 8729",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/4096",
            "value": 49839,
            "range": "± 35855",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/65536",
            "value": 201453,
            "range": "± 102580",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/1048576",
            "value": 3947470,
            "range": "± 1178587",
            "unit": "ns/iter"
          },
          {
            "name": "random_read/root_block_1000",
            "value": 595,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/1024_bytes",
            "value": 8042,
            "range": "± 30",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/65536_bytes",
            "value": 46069,
            "range": "± 51",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/1048576_bytes",
            "value": 634991,
            "range": "± 3854",
            "unit": "ns/iter"
          },
          {
            "name": "cache/add_entry",
            "value": 395,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "cache/access",
            "value": 202,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/100",
            "value": 22294,
            "range": "± 177",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/1000",
            "value": 39044,
            "range": "± 159",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/10000",
            "value": 39026,
            "range": "± 235",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/1048576_bytes",
            "value": 602992,
            "range": "± 105",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/5242880_bytes",
            "value": 3016262,
            "range": "± 2967",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/10485760_bytes",
            "value": 6055991,
            "range": "± 16816",
            "unit": "ns/iter"
          },
          {
            "name": "startup/empty_db",
            "value": 2175070,
            "range": "± 809251",
            "unit": "ns/iter"
          },
          {
            "name": "startup/populated_db",
            "value": 5667765,
            "range": "± 1474741",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/100",
            "value": 625511,
            "range": "± 198644",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/1000",
            "value": 603860,
            "range": "± 531322",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/10000",
            "value": 660753,
            "range": "± 690717",
            "unit": "ns/iter"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "admin@adminwizard.tech",
            "name": "AdminWizard"
          },
          "committer": {
            "email": "admin@adminwizard.tech",
            "name": "AdminWizard"
          },
          "distinct": true,
          "id": "b6ab5afacc78e5f565d1e7aa47723798ed02360c",
          "message": "fix(cli): derive testnet magic banner from magic_bytes() (was stale \"TES3\")\n\nThe startup banner hardcoded \"Magic bytes: TES3\" and didn't get bumped with\nthe TES3->TES4 fork, so nodes on TES4 printed TES3. Derive the display from\nNetworkMode::Testnet.magic_bytes() so it tracks the real magic automatically.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>",
          "timestamp": "2026-07-12T20:46:18-04:00",
          "tree_id": "4be5191a01cfe4e231ef0cf242ff41b2b88dfa54",
          "url": "https://github.com/superness/swimchain/commit/b6ab5afacc78e5f565d1e7aa47723798ed02360c"
        },
        "date": 1783905160239,
        "tool": "cargo",
        "benches": [
          {
            "name": "mobile_single_hash/mobile_64mib_p2",
            "value": 103791298,
            "range": "± 767618",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_single_hash/desktop_64mib_p4",
            "value": 101474899,
            "range": "± 1026912",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_single_hash/test_1mib_p1",
            "value": 390551,
            "range": "± 509",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/4",
            "value": 1252562211,
            "range": "± 1335411602",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/6",
            "value": 7537419010,
            "range": "± 4508215935",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/8",
            "value": 19148591714,
            "range": "± 22797547294",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/4",
            "value": 6136232,
            "range": "± 719988",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/6",
            "value": 25703891,
            "range": "± 6123315",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/8",
            "value": 115305705,
            "range": "± 35371534",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/10",
            "value": 392081106,
            "range": "± 209256377",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/12",
            "value": 681540615,
            "range": "± 1847351533",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Post",
            "value": 1091439777,
            "range": "± 1422592515",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Reply",
            "value": 1296176633,
            "range": "± 1295981883",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Engage",
            "value": 970002215,
            "range": "± 1683914676",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/3G_2mbps",
            "value": 3043319813,
            "range": "± 2089359",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/4G_10mbps",
            "value": 3381,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/WiFi_50mbps",
            "value": 3384,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/1KB",
            "value": 5324,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/4KB",
            "value": 1373,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/16KB",
            "value": 403,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/64KB",
            "value": 138,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "node_startup",
            "value": 2429510338,
            "range": "± 129382039",
            "unit": "ns/iter"
          },
          {
            "name": "node_shutdown",
            "value": 2355500094,
            "range": "± 3686865",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/2",
            "value": 4822281133,
            "range": "± 59530381",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/3",
            "value": 7220597884,
            "range": "± 57548479",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/5",
            "value": 12172835698,
            "range": "± 226474475",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/10",
            "value": 24088360020,
            "range": "± 315490117",
            "unit": "ns/iter"
          },
          {
            "name": "chain_store_access",
            "value": 12,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "connection_manager_access",
            "value": 12,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_info",
            "value": 98246,
            "range": "± 2126",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_sync_status",
            "value": 329855,
            "range": "± 3172",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_chain_stats",
            "value": 99592,
            "range": "± 2651",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_peers",
            "value": 92647,
            "range": "± 1603",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/list_spaces",
            "value": 93182,
            "range": "± 1901",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/feed_poll",
            "value": 533916,
            "range": "± 7989",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/create_space",
            "value": 8885688,
            "range": "± 1247994",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/submit_post",
            "value": 18056492,
            "range": "± 2150824",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/list_space_content_populated",
            "value": 3261124,
            "range": "± 21930",
            "unit": "ns/iter"
          },
          {
            "name": "keypair_generation",
            "value": 18676,
            "range": "± 40",
            "unit": "ns/iter"
          },
          {
            "name": "sign_32bytes",
            "value": 37030,
            "range": "± 31",
            "unit": "ns/iter"
          },
          {
            "name": "sign_1kb",
            "value": 41249,
            "range": "± 491",
            "unit": "ns/iter"
          },
          {
            "name": "verify_signature",
            "value": 39805,
            "range": "± 36",
            "unit": "ns/iter"
          },
          {
            "name": "encode_address",
            "value": 333,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decode_address",
            "value": 483,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/8",
            "value": 37351,
            "range": "± 408",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/12",
            "value": 319220,
            "range": "± 5535",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/16",
            "value": 4668298,
            "range": "± 618449",
            "unit": "ns/iter"
          },
          {
            "name": "encrypt_private_key",
            "value": 89703011,
            "range": "± 752857",
            "unit": "ns/iter"
          },
          {
            "name": "decrypt_private_key",
            "value": 91436336,
            "range": "± 1126148",
            "unit": "ns/iter"
          },
          {
            "name": "export_identity",
            "value": 90337231,
            "range": "± 495268",
            "unit": "ns/iter"
          },
          {
            "name": "import_identity",
            "value": 89039013,
            "range": "± 298833",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_1mib",
            "value": 391252,
            "range": "± 355",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/4",
            "value": 6358067,
            "range": "± 1234982",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/8",
            "value": 125629594,
            "range": "± 80705054",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/10",
            "value": 281571593,
            "range": "± 520482989",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/12",
            "value": 1048790971,
            "range": "± 766896846",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_64mib",
            "value": 91582127,
            "range": "± 275219",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_mobile",
            "value": 91238395,
            "range": "± 224593",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/test_1mib",
            "value": 390501,
            "range": "± 848",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/mobile_64mib_p2",
            "value": 91486805,
            "range": "± 488502",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/prod_64mib_p4",
            "value": 92079998,
            "range": "± 313423",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/100",
            "value": 1642766,
            "range": "± 19221",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/500",
            "value": 5347669,
            "range": "± 256635",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/1000",
            "value": 10365282,
            "range": "± 37581",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/100",
            "value": 233,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/1000",
            "value": 248,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/5000",
            "value": 317,
            "range": "± 7",
            "unit": "ns/iter"
          },
          {
            "name": "insert_with_branch/insert_default_threshold",
            "value": 22748,
            "range": "± 1594",
            "unit": "ns/iter"
          },
          {
            "name": "insert_with_branch/insert_small_threshold",
            "value": 97116,
            "range": "± 12252",
            "unit": "ns/iter"
          },
          {
            "name": "space_state_lookup/get_space_branch_state",
            "value": 230,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "hash_branch_matching/assign_branch_unfractured",
            "value": 212,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "hash_branch_matching/assign_branch_fractured",
            "value": 249,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/2MB",
            "value": 1402326,
            "range": "± 3534",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/10MB",
            "value": 11241534,
            "range": "± 46968",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/50MB",
            "value": 57406590,
            "range": "± 82279",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/100MB",
            "value": 114214984,
            "range": "± 536653",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/2MB",
            "value": 2755248,
            "range": "± 22786",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/10MB",
            "value": 13945438,
            "range": "± 119014",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/50MB",
            "value": 91027245,
            "range": "± 653283",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/2MB",
            "value": 1515341,
            "range": "± 1583",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/10MB",
            "value": 7728422,
            "range": "± 55979",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/50MB",
            "value": 40699978,
            "range": "± 228164",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/2",
            "value": 785,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/10",
            "value": 3332,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/50",
            "value": 15087,
            "range": "± 17",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/100",
            "value": 29527,
            "range": "± 191",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/500",
            "value": 144840,
            "range": "± 436",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/1024",
            "value": 294898,
            "range": "± 619",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/2",
            "value": 858,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/10",
            "value": 3729,
            "range": "± 9",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/50",
            "value": 17692,
            "range": "± 31",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/100",
            "value": 35380,
            "range": "± 203",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/500",
            "value": 173067,
            "range": "± 353",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/1024",
            "value": 351861,
            "range": "± 868",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/1MB",
            "value": 702562,
            "range": "± 1018",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/10MB",
            "value": 7256562,
            "range": "± 63363",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/100MB",
            "value": 111203482,
            "range": "± 189049",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/500MB",
            "value": 560634042,
            "range": "± 2835337",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/1024MB",
            "value": 1156333599,
            "range": "± 874224",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/10",
            "value": 33849,
            "range": "± 42",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/50",
            "value": 138649,
            "range": "± 265",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/100",
            "value": 259956,
            "range": "± 346",
            "unit": "ns/iter"
          },
          {
            "name": "decay_simulation/10k_posts_60_days",
            "value": 17112589,
            "range": "± 457883",
            "unit": "ns/iter"
          },
          {
            "name": "decay_simulation_large/100k_posts_60_days",
            "value": 208148698,
            "range": "± 765648",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/1000",
            "value": 25,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/10000",
            "value": 53107,
            "range": "± 448",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/50000",
            "value": 241960,
            "range": "± 2223",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/100",
            "value": 28973,
            "range": "± 25",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/1000",
            "value": 299056,
            "range": "± 4007",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/10000",
            "value": 3440100,
            "range": "± 11360",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/100000",
            "value": 30053585,
            "range": "± 33462",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/1000",
            "value": 1632,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/10000",
            "value": 25814,
            "range": "± 38",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/100000",
            "value": 153748,
            "range": "± 938",
            "unit": "ns/iter"
          },
          {
            "name": "header_hash",
            "value": 335,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "meets_difficulty",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Budget_1GB",
            "value": 2837362,
            "range": "± 6279",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Standard_5GB",
            "value": 15311453,
            "range": "± 106625",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Flagship_10GB",
            "value": 31757346,
            "range": "± 977585",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/50",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/75",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/90",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/95",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/99",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/1KB",
            "value": 328434,
            "range": "± 20719",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/10KB",
            "value": 378652,
            "range": "± 20570",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/100KB",
            "value": 583956,
            "range": "± 14734",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/100",
            "value": 1463,
            "range": "± 9",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/1000",
            "value": 15319,
            "range": "± 78",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/10000",
            "value": 222807,
            "range": "± 1925",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/steady_state",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/daily_growth",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/avg_post_size",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/10_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/100_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/1000_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/10000_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/budget_1gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/standard_5gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/flagship_10gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/root_block",
            "value": 5357,
            "range": "± 573",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/space_block",
            "value": 602,
            "range": "± 5",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/content_block",
            "value": 621,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/1024",
            "value": 6703,
            "range": "± 4588",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/4096",
            "value": 13979,
            "range": "± 8301",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/65536",
            "value": 151917,
            "range": "± 57544",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/1048576",
            "value": 2185337,
            "range": "± 97975",
            "unit": "ns/iter"
          },
          {
            "name": "random_read/root_block_1000",
            "value": 738,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/1024_bytes",
            "value": 10454,
            "range": "± 11",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/65536_bytes",
            "value": 59712,
            "range": "± 146",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/1048576_bytes",
            "value": 811637,
            "range": "± 53814",
            "unit": "ns/iter"
          },
          {
            "name": "cache/add_entry",
            "value": 506,
            "range": "± 10",
            "unit": "ns/iter"
          },
          {
            "name": "cache/access",
            "value": 258,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/100",
            "value": 29082,
            "range": "± 148",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/1000",
            "value": 50337,
            "range": "± 176",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/10000",
            "value": 50423,
            "range": "± 277",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/1048576_bytes",
            "value": 779885,
            "range": "± 464",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/5242880_bytes",
            "value": 3908785,
            "range": "± 2331",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/10485760_bytes",
            "value": 7922958,
            "range": "± 14914",
            "unit": "ns/iter"
          },
          {
            "name": "startup/empty_db",
            "value": 2045576,
            "range": "± 59925",
            "unit": "ns/iter"
          },
          {
            "name": "startup/populated_db",
            "value": 6545995,
            "range": "± 115365",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/100",
            "value": 431910,
            "range": "± 13918",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/1000",
            "value": 535226,
            "range": "± 125913",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/10000",
            "value": 563494,
            "range": "± 18350",
            "unit": "ns/iter"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "admin@adminwizard.tech",
            "name": "AdminWizard"
          },
          "committer": {
            "email": "admin@adminwizard.tech",
            "name": "AdminWizard"
          },
          "distinct": true,
          "id": "8bf80409ed33dc547c117cd19686e7ea141883c8",
          "message": "feat(consensus): network-gate block cadence — lively test networks, conservative mainnet\n\nOn a quiet chain, block cadence is gated not by PoW (difficulty_target is tiny)\nbut by leader-eligibility expansion (MAX_ELIGIBILITY_TIME=480s) plus a 5-min\nbackup poll — ~10 min/block, which makes testnet demos look dead. Gate both by\nnetwork mode: mainnet keeps 480s eligibility + 300s poll; testnet/regtest use\n45s + 30s so a quiet chain still seals blocks every ~minute. Faster blocks mean\nmore forks/reorgs and more chain growth, acceptable at test-net stakes only.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>",
          "timestamp": "2026-07-12T21:09:43-04:00",
          "tree_id": "403905b1393340aaf86eb3fe64b59fbb01937ff9",
          "url": "https://github.com/superness/swimchain/commit/8bf80409ed33dc547c117cd19686e7ea141883c8"
        },
        "date": 1783906726884,
        "tool": "cargo",
        "benches": [
          {
            "name": "mobile_single_hash/mobile_64mib_p2",
            "value": 93724352,
            "range": "± 408338",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_single_hash/desktop_64mib_p4",
            "value": 93590758,
            "range": "± 142159",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_single_hash/test_1mib_p1",
            "value": 391848,
            "range": "± 759",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/4",
            "value": 1075749508,
            "range": "± 708091542",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/6",
            "value": 6471683373,
            "range": "± 4679195779",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/8",
            "value": 22378459574,
            "range": "± 24148816319",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/4",
            "value": 6205493,
            "range": "± 1508226",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/6",
            "value": 20989231,
            "range": "± 11902119",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/8",
            "value": 138120133,
            "range": "± 90438432",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/10",
            "value": 223330833,
            "range": "± 379663532",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/12",
            "value": 975121344,
            "range": "± 2265467487",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Post",
            "value": 2095427693,
            "range": "± 1119302995",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Reply",
            "value": 1865424167,
            "range": "± 1702000674",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Engage",
            "value": 721765203,
            "range": "± 694639714",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/3G_2mbps",
            "value": 3040588856,
            "range": "± 1823958",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/4G_10mbps",
            "value": 2985,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/WiFi_50mbps",
            "value": 2990,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/1KB",
            "value": 4718,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/4KB",
            "value": 1217,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/16KB",
            "value": 364,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/64KB",
            "value": 127,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "node_startup",
            "value": 2451483617,
            "range": "± 116835475",
            "unit": "ns/iter"
          },
          {
            "name": "node_shutdown",
            "value": 2359587174,
            "range": "± 3360121",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/2",
            "value": 4883414375,
            "range": "± 58510448",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/3",
            "value": 7240842314,
            "range": "± 45986823",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/5",
            "value": 12065270860,
            "range": "± 316916464",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/10",
            "value": 24120115283,
            "range": "± 361294286",
            "unit": "ns/iter"
          },
          {
            "name": "chain_store_access",
            "value": 3,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "connection_manager_access",
            "value": 3,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_info",
            "value": 169540,
            "range": "± 2743",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_sync_status",
            "value": 659593,
            "range": "± 3547",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_chain_stats",
            "value": 170302,
            "range": "± 3806",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_peers",
            "value": 161926,
            "range": "± 1056",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/list_spaces",
            "value": 163872,
            "range": "± 1530",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/feed_poll",
            "value": 1002067,
            "range": "± 12180",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/create_space",
            "value": 7310344,
            "range": "± 701226",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/submit_post",
            "value": 21278722,
            "range": "± 2287992",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/list_space_content_populated",
            "value": 5186451,
            "range": "± 17514",
            "unit": "ns/iter"
          },
          {
            "name": "keypair_generation",
            "value": 18684,
            "range": "± 28",
            "unit": "ns/iter"
          },
          {
            "name": "sign_32bytes",
            "value": 37050,
            "range": "± 40",
            "unit": "ns/iter"
          },
          {
            "name": "sign_1kb",
            "value": 41187,
            "range": "± 15",
            "unit": "ns/iter"
          },
          {
            "name": "verify_signature",
            "value": 40038,
            "range": "± 300",
            "unit": "ns/iter"
          },
          {
            "name": "encode_address",
            "value": 332,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decode_address",
            "value": 483,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/8",
            "value": 36715,
            "range": "± 536",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/12",
            "value": 307709,
            "range": "± 10553",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/16",
            "value": 4758762,
            "range": "± 371889",
            "unit": "ns/iter"
          },
          {
            "name": "encrypt_private_key",
            "value": 87246603,
            "range": "± 390536",
            "unit": "ns/iter"
          },
          {
            "name": "decrypt_private_key",
            "value": 87452486,
            "range": "± 265283",
            "unit": "ns/iter"
          },
          {
            "name": "export_identity",
            "value": 87389253,
            "range": "± 231210",
            "unit": "ns/iter"
          },
          {
            "name": "import_identity",
            "value": 87503718,
            "range": "± 510127",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_1mib",
            "value": 393266,
            "range": "± 684",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/4",
            "value": 6400539,
            "range": "± 1003881",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/8",
            "value": 111599450,
            "range": "± 51666765",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/10",
            "value": 217221108,
            "range": "± 426672855",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/12",
            "value": 1864932228,
            "range": "± 1886645868",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_64mib",
            "value": 89934479,
            "range": "± 465763",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_mobile",
            "value": 88938393,
            "range": "± 261877",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/test_1mib",
            "value": 392096,
            "range": "± 380",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/mobile_64mib_p2",
            "value": 88907306,
            "range": "± 283009",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/prod_64mib_p4",
            "value": 89940672,
            "range": "± 472842",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/100",
            "value": 1713897,
            "range": "± 89775",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/500",
            "value": 5354447,
            "range": "± 529004",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/1000",
            "value": 10495444,
            "range": "± 208442",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/100",
            "value": 245,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/1000",
            "value": 258,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/5000",
            "value": 336,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "insert_with_branch/insert_default_threshold",
            "value": 22930,
            "range": "± 1394",
            "unit": "ns/iter"
          },
          {
            "name": "insert_with_branch/insert_small_threshold",
            "value": 97761,
            "range": "± 12532",
            "unit": "ns/iter"
          },
          {
            "name": "space_state_lookup/get_space_branch_state",
            "value": 240,
            "range": "± 7",
            "unit": "ns/iter"
          },
          {
            "name": "hash_branch_matching/assign_branch_unfractured",
            "value": 211,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "hash_branch_matching/assign_branch_fractured",
            "value": 257,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/2MB",
            "value": 1392266,
            "range": "± 7874",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/10MB",
            "value": 10998301,
            "range": "± 54510",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/50MB",
            "value": 56311612,
            "range": "± 90971",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/100MB",
            "value": 112791374,
            "range": "± 211996",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/2MB",
            "value": 2741885,
            "range": "± 24373",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/10MB",
            "value": 13715403,
            "range": "± 130266",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/50MB",
            "value": 90314923,
            "range": "± 568596",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/2MB",
            "value": 1505821,
            "range": "± 6783",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/10MB",
            "value": 7497874,
            "range": "± 38883",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/50MB",
            "value": 39969952,
            "range": "± 235011",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/2",
            "value": 773,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/10",
            "value": 3211,
            "range": "± 10",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/50",
            "value": 15009,
            "range": "± 67",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/100",
            "value": 29469,
            "range": "± 30",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/500",
            "value": 143871,
            "range": "± 254",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/1024",
            "value": 294933,
            "range": "± 1188",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/2",
            "value": 859,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/10",
            "value": 3708,
            "range": "± 5",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/50",
            "value": 17365,
            "range": "± 14",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/100",
            "value": 34637,
            "range": "± 37",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/500",
            "value": 170517,
            "range": "± 135",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/1024",
            "value": 347502,
            "range": "± 246",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/1MB",
            "value": 697506,
            "range": "± 243",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/10MB",
            "value": 6992499,
            "range": "± 12548",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/100MB",
            "value": 113503683,
            "range": "± 185485",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/500MB",
            "value": 561830735,
            "range": "± 2472395",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/1024MB",
            "value": 1155714924,
            "range": "± 1352639",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/10",
            "value": 33395,
            "range": "± 58",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/50",
            "value": 136077,
            "range": "± 1401",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/100",
            "value": 263276,
            "range": "± 435",
            "unit": "ns/iter"
          },
          {
            "name": "decay_simulation/10k_posts_60_days",
            "value": 16622077,
            "range": "± 308695",
            "unit": "ns/iter"
          },
          {
            "name": "decay_simulation_large/100k_posts_60_days",
            "value": 204458448,
            "range": "± 643162",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/1000",
            "value": 27,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/10000",
            "value": 52342,
            "range": "± 314",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/50000",
            "value": 239817,
            "range": "± 2227",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/100",
            "value": 29691,
            "range": "± 35",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/1000",
            "value": 301064,
            "range": "± 594",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/10000",
            "value": 2999516,
            "range": "± 2896",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/100000",
            "value": 29893155,
            "range": "± 37876",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/1000",
            "value": 1743,
            "range": "± 8",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/10000",
            "value": 25558,
            "range": "± 54",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/100000",
            "value": 200485,
            "range": "± 453",
            "unit": "ns/iter"
          },
          {
            "name": "header_hash",
            "value": 297,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "meets_difficulty",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Budget_1GB",
            "value": 2888930,
            "range": "± 24309",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Standard_5GB",
            "value": 15272720,
            "range": "± 61141",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Flagship_10GB",
            "value": 30945369,
            "range": "± 328303",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/50",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/75",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/90",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/95",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/99",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/1KB",
            "value": 391034,
            "range": "± 9637",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/10KB",
            "value": 444261,
            "range": "± 20862",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/100KB",
            "value": 617503,
            "range": "± 39262",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/100",
            "value": 1385,
            "range": "± 6",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/1000",
            "value": 15880,
            "range": "± 382",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/10000",
            "value": 212474,
            "range": "± 1484",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/steady_state",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/daily_growth",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/avg_post_size",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/10_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/100_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/1000_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/10000_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/budget_1gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/standard_5gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/flagship_10gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/root_block",
            "value": 4753,
            "range": "± 410",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/space_block",
            "value": 627,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/content_block",
            "value": 590,
            "range": "± 7",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/1024",
            "value": 8660,
            "range": "± 8344",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/4096",
            "value": 18094,
            "range": "± 15811",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/65536",
            "value": 151891,
            "range": "± 64176",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/1048576",
            "value": 2028847,
            "range": "± 111888",
            "unit": "ns/iter"
          },
          {
            "name": "random_read/root_block_1000",
            "value": 711,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/1024_bytes",
            "value": 8129,
            "range": "± 5",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/65536_bytes",
            "value": 51079,
            "range": "± 11",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/1048576_bytes",
            "value": 729215,
            "range": "± 1512",
            "unit": "ns/iter"
          },
          {
            "name": "cache/add_entry",
            "value": 557,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "cache/access",
            "value": 266,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/100",
            "value": 28552,
            "range": "± 61",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/1000",
            "value": 53881,
            "range": "± 240",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/10000",
            "value": 54122,
            "range": "± 147",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/1048576_bytes",
            "value": 699941,
            "range": "± 357",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/5242880_bytes",
            "value": 3498487,
            "range": "± 1428",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/10485760_bytes",
            "value": 7004514,
            "range": "± 10189",
            "unit": "ns/iter"
          },
          {
            "name": "startup/empty_db",
            "value": 2203211,
            "range": "± 81125",
            "unit": "ns/iter"
          },
          {
            "name": "startup/populated_db",
            "value": 5756015,
            "range": "± 96220",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/100",
            "value": 518818,
            "range": "± 29707",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/1000",
            "value": 675090,
            "range": "± 11888",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/10000",
            "value": 695995,
            "range": "± 18871",
            "unit": "ns/iter"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "admin@adminwizard.tech",
            "name": "AdminWizard"
          },
          "committer": {
            "email": "admin@adminwizard.tech",
            "name": "AdminWizard"
          },
          "distinct": true,
          "id": "81ee48eb8411fd5126b57840654a96a068dd2f55",
          "message": "fix(rpc,chess): mempool replies carry a body; chess plays from mempool\n\nget_replies already merges pending mempool replies, but returned them with an\nEMPTY body (it only checked the content store; submit_reply writes the body to\nthe sync blob store) and with author_id as bech32 while finalized replies use\npubkey hex. So a just-played move was invisible until it finalized (~block\nlatency) and author ids were inconsistent. Fix both: fall back to the sync blob\nstore for a pending reply's body, and use pubkey hex consistently.\n\nChess client: optimistic local move (shows instantly), monotonic poll (won't\nclobber an unfinalized move), 1.5s poll, header JSON unwrapped from title\\n\\nbody,\nunique per-game/ply move bodies (content-addressing collision), lenient fold\n(legality + turn order; node enforces authorship), remote-RPC endpoint + /chess\nbase, copy-address button, auth-ready gating on reads.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>",
          "timestamp": "2026-07-12T22:55:57-04:00",
          "tree_id": "8646dbe9c0880f307970665bad515ab2eaf219b1",
          "url": "https://github.com/superness/swimchain/commit/81ee48eb8411fd5126b57840654a96a068dd2f55"
        },
        "date": 1783912960651,
        "tool": "cargo",
        "benches": [
          {
            "name": "mobile_single_hash/mobile_64mib_p2",
            "value": 95056056,
            "range": "± 670589",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_single_hash/desktop_64mib_p4",
            "value": 97193530,
            "range": "± 1036584",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_single_hash/test_1mib_p1",
            "value": 389596,
            "range": "± 537",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/4",
            "value": 726212342,
            "range": "± 947360537",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/6",
            "value": 2266855564,
            "range": "± 5698530214",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/8",
            "value": 9330778485,
            "range": "± 38039566067",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/4",
            "value": 6402530,
            "range": "± 664908",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/6",
            "value": 24729713,
            "range": "± 5087904",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/8",
            "value": 85751851,
            "range": "± 87562866",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/10",
            "value": 185515217,
            "range": "± 247949970",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/12",
            "value": 1348145901,
            "range": "± 2018974965",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Post",
            "value": 919377606,
            "range": "± 1677919279",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Reply",
            "value": 1635290499,
            "range": "± 1614541779",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Engage",
            "value": 1470111472,
            "range": "± 881059575",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/3G_2mbps",
            "value": 3033035178,
            "range": "± 1554926",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/4G_10mbps",
            "value": 3289,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/WiFi_50mbps",
            "value": 3411,
            "range": "± 14",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/1KB",
            "value": 5179,
            "range": "± 17",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/4KB",
            "value": 1347,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/16KB",
            "value": 403,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/64KB",
            "value": 141,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "node_startup",
            "value": 2422402466,
            "range": "± 75433146",
            "unit": "ns/iter"
          },
          {
            "name": "node_shutdown",
            "value": 2357798830,
            "range": "± 2699087",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/2",
            "value": 4835702937,
            "range": "± 90539907",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/3",
            "value": 7227410780,
            "range": "± 79825600",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/5",
            "value": 12154640766,
            "range": "± 231971967",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/10",
            "value": 24078408523,
            "range": "± 347213504",
            "unit": "ns/iter"
          },
          {
            "name": "chain_store_access",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "connection_manager_access",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_info",
            "value": 144882,
            "range": "± 2846",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_sync_status",
            "value": 711274,
            "range": "± 3971",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_chain_stats",
            "value": 151182,
            "range": "± 5402",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_peers",
            "value": 140333,
            "range": "± 3477",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/list_spaces",
            "value": 142555,
            "range": "± 4260",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/feed_poll",
            "value": 1020689,
            "range": "± 16652",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/create_space",
            "value": 7899052,
            "range": "± 1443113",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/submit_post",
            "value": 17954524,
            "range": "± 1918706",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/list_space_content_populated",
            "value": 4539692,
            "range": "± 108282",
            "unit": "ns/iter"
          },
          {
            "name": "keypair_generation",
            "value": 18649,
            "range": "± 51",
            "unit": "ns/iter"
          },
          {
            "name": "sign_32bytes",
            "value": 36995,
            "range": "± 22",
            "unit": "ns/iter"
          },
          {
            "name": "sign_1kb",
            "value": 41192,
            "range": "± 236",
            "unit": "ns/iter"
          },
          {
            "name": "verify_signature",
            "value": 46256,
            "range": "± 13",
            "unit": "ns/iter"
          },
          {
            "name": "encode_address",
            "value": 333,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "decode_address",
            "value": 483,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/8",
            "value": 36496,
            "range": "± 208",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/12",
            "value": 303821,
            "range": "± 14416",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/16",
            "value": 4351458,
            "range": "± 504391",
            "unit": "ns/iter"
          },
          {
            "name": "encrypt_private_key",
            "value": 92019082,
            "range": "± 463712",
            "unit": "ns/iter"
          },
          {
            "name": "decrypt_private_key",
            "value": 95154094,
            "range": "± 2291854",
            "unit": "ns/iter"
          },
          {
            "name": "export_identity",
            "value": 93354878,
            "range": "± 728171",
            "unit": "ns/iter"
          },
          {
            "name": "import_identity",
            "value": 92420195,
            "range": "± 689180",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_1mib",
            "value": 390638,
            "range": "± 227",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/4",
            "value": 6288788,
            "range": "± 1087541",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/8",
            "value": 105772832,
            "range": "± 49833178",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/10",
            "value": 173277856,
            "range": "± 279299403",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/12",
            "value": 1025009125,
            "range": "± 860563423",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_64mib",
            "value": 94483154,
            "range": "± 604961",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_mobile",
            "value": 93732249,
            "range": "± 994598",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/test_1mib",
            "value": 392551,
            "range": "± 325",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/mobile_64mib_p2",
            "value": 96497965,
            "range": "± 1366302",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/prod_64mib_p4",
            "value": 98447900,
            "range": "± 2263552",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/100",
            "value": 1822836,
            "range": "± 220548",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/500",
            "value": 5624748,
            "range": "± 65386",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/1000",
            "value": 10901828,
            "range": "± 118519",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/100",
            "value": 233,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/1000",
            "value": 246,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/5000",
            "value": 315,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "insert_with_branch/insert_default_threshold",
            "value": 23027,
            "range": "± 1606",
            "unit": "ns/iter"
          },
          {
            "name": "insert_with_branch/insert_small_threshold",
            "value": 99344,
            "range": "± 12650",
            "unit": "ns/iter"
          },
          {
            "name": "space_state_lookup/get_space_branch_state",
            "value": 226,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "hash_branch_matching/assign_branch_unfractured",
            "value": 210,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "hash_branch_matching/assign_branch_fractured",
            "value": 248,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/2MB",
            "value": 1398672,
            "range": "± 1448",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/10MB",
            "value": 11211501,
            "range": "± 50018",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/50MB",
            "value": 57404626,
            "range": "± 219422",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/100MB",
            "value": 113593601,
            "range": "± 382775",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/2MB",
            "value": 2748514,
            "range": "± 25666",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/10MB",
            "value": 13826023,
            "range": "± 152064",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/50MB",
            "value": 90956568,
            "range": "± 663430",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/2MB",
            "value": 1524185,
            "range": "± 2193",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/10MB",
            "value": 7628416,
            "range": "± 53042",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/50MB",
            "value": 40797265,
            "range": "± 141851",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/2",
            "value": 759,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/10",
            "value": 3313,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/50",
            "value": 15361,
            "range": "± 242",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/100",
            "value": 34930,
            "range": "± 47",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/500",
            "value": 146651,
            "range": "± 464",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/1024",
            "value": 299251,
            "range": "± 378",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/2",
            "value": 846,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/10",
            "value": 3708,
            "range": "± 7",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/50",
            "value": 17723,
            "range": "± 44",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/100",
            "value": 34865,
            "range": "± 34",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/500",
            "value": 171375,
            "range": "± 712",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/1024",
            "value": 349113,
            "range": "± 1477",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/1MB",
            "value": 698904,
            "range": "± 626",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/10MB",
            "value": 7175369,
            "range": "± 31974",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/100MB",
            "value": 111206066,
            "range": "± 394403",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/500MB",
            "value": 561658032,
            "range": "± 2513509",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/1024MB",
            "value": 1158136911,
            "range": "± 628003",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/10",
            "value": 34068,
            "range": "± 54",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/50",
            "value": 135776,
            "range": "± 325",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/100",
            "value": 262548,
            "range": "± 492",
            "unit": "ns/iter"
          },
          {
            "name": "decay_simulation/10k_posts_60_days",
            "value": 17270808,
            "range": "± 555729",
            "unit": "ns/iter"
          },
          {
            "name": "decay_simulation_large/100k_posts_60_days",
            "value": 213818721,
            "range": "± 1417973",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/1000",
            "value": 25,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/10000",
            "value": 53590,
            "range": "± 695",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/50000",
            "value": 244955,
            "range": "± 3202",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/100",
            "value": 29386,
            "range": "± 24",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/1000",
            "value": 301475,
            "range": "± 242",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/10000",
            "value": 2970441,
            "range": "± 5843",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/100000",
            "value": 29720465,
            "range": "± 41184",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/1000",
            "value": 1632,
            "range": "± 15",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/10000",
            "value": 19635,
            "range": "± 68",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/100000",
            "value": 151932,
            "range": "± 609",
            "unit": "ns/iter"
          },
          {
            "name": "header_hash",
            "value": 297,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "meets_difficulty",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Budget_1GB",
            "value": 2546703,
            "range": "± 99032",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Standard_5GB",
            "value": 14282750,
            "range": "± 181939",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Flagship_10GB",
            "value": 29259558,
            "range": "± 371986",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/50",
            "value": 3,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/75",
            "value": 3,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/90",
            "value": 3,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/95",
            "value": 3,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/99",
            "value": 3,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/1KB",
            "value": 860470,
            "range": "± 279145",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/10KB",
            "value": 729393,
            "range": "± 399497",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/100KB",
            "value": 1376732,
            "range": "± 1454273",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/100",
            "value": 1234,
            "range": "± 27",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/1000",
            "value": 14264,
            "range": "± 212",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/10000",
            "value": 286211,
            "range": "± 10055",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_7",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_14",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_30",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_60",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_90",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_7",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_14",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_30",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_60",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_90",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_7",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_14",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_30",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_60",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_90",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/steady_state",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/daily_growth",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/avg_post_size",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/10_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/100_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/1000_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/10000_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/budget_1gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/standard_5gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/flagship_10gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/root_block",
            "value": 4772,
            "range": "± 257",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/space_block",
            "value": 591,
            "range": "± 9",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/content_block",
            "value": 588,
            "range": "± 18",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/1024",
            "value": 861520,
            "range": "± 847020",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/4096",
            "value": 414463,
            "range": "± 640199",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/65536",
            "value": 286493,
            "range": "± 164916",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/1048576",
            "value": 5536401,
            "range": "± 2430808",
            "unit": "ns/iter"
          },
          {
            "name": "random_read/root_block_1000",
            "value": 571,
            "range": "± 5",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/1024_bytes",
            "value": 4124,
            "range": "± 46",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/65536_bytes",
            "value": 47690,
            "range": "± 1275",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/1048576_bytes",
            "value": 749444,
            "range": "± 6649",
            "unit": "ns/iter"
          },
          {
            "name": "cache/add_entry",
            "value": 449,
            "range": "± 19",
            "unit": "ns/iter"
          },
          {
            "name": "cache/access",
            "value": 221,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/100",
            "value": 27505,
            "range": "± 330",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/1000",
            "value": 50960,
            "range": "± 456",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/10000",
            "value": 49942,
            "range": "± 647",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/1048576_bytes",
            "value": 694501,
            "range": "± 8118",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/5242880_bytes",
            "value": 3480252,
            "range": "± 41868",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/10485760_bytes",
            "value": 6902245,
            "range": "± 75488",
            "unit": "ns/iter"
          },
          {
            "name": "startup/empty_db",
            "value": 6891065,
            "range": "± 5446943",
            "unit": "ns/iter"
          },
          {
            "name": "startup/populated_db",
            "value": 16774788,
            "range": "± 9121541",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/100",
            "value": 2179551,
            "range": "± 10767942",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/1000",
            "value": 1261764,
            "range": "± 1994349",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/10000",
            "value": 964108,
            "range": "± 475458",
            "unit": "ns/iter"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "admin@adminwizard.tech",
            "name": "AdminWizard"
          },
          "committer": {
            "email": "admin@adminwizard.tech",
            "name": "AdminWizard"
          },
          "distinct": true,
          "id": "a2b7785dff48e6c68a680e3945e1dc539ed8d8b8",
          "message": "fix(sponsorship): anchor offer created_at to the signed timestamp so offers propagate\n\ncreate_sponsorship_offer verified the sponsor signature over the client's\nparams.timestamp but stored the offer with created_at = server current_time.\nPeers re-verify a propagated offer via PublicSponsorshipOffer::signature_message(),\nwhich derives the signed timestamp from created_at — so with server time stored\nthere, the signature never re-verified on any other node and the offer was\nsilently dropped on propagation. The creating node kept it (verified against\nparams.timestamp at creation), marooning the faucet's offer on the bot and\nleaving new users unable to onboard.\n\nAnchor created_at/expires_at to params.timestamp. Adds regression test\noffer_signature_reverifies_only_when_created_at_is_the_signed_timestamp.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>",
          "timestamp": "2026-07-12T23:09:33-04:00",
          "tree_id": "4bec2bc9b92c582b07bcbd08b77ab54f89161c32",
          "url": "https://github.com/superness/swimchain/commit/a2b7785dff48e6c68a680e3945e1dc539ed8d8b8"
        },
        "date": 1783914557092,
        "tool": "cargo",
        "benches": [
          {
            "name": "mobile_single_hash/mobile_64mib_p2",
            "value": 89497175,
            "range": "± 135338",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_single_hash/desktop_64mib_p4",
            "value": 90315074,
            "range": "± 1536343",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_single_hash/test_1mib_p1",
            "value": 392662,
            "range": "± 272",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/4",
            "value": 492360007,
            "range": "± 2043271846",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/6",
            "value": 7346280137,
            "range": "± 5324352193",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/8",
            "value": 11663538030,
            "range": "± 27551011810",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/4",
            "value": 6230077,
            "range": "± 1670742",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/6",
            "value": 26575481,
            "range": "± 10468678",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/8",
            "value": 78912015,
            "range": "± 42960361",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/10",
            "value": 134563774,
            "range": "± 410994573",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/12",
            "value": 612308743,
            "range": "± 1347306633",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Post",
            "value": 1035369997,
            "range": "± 2223336357",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Reply",
            "value": 854947773,
            "range": "± 1324349809",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Engage",
            "value": 1079574483,
            "range": "± 804081461",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/3G_2mbps",
            "value": 3039537092,
            "range": "± 2401691",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/4G_10mbps",
            "value": 2987,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/WiFi_50mbps",
            "value": 2990,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/1KB",
            "value": 4717,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/4KB",
            "value": 1218,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/16KB",
            "value": 364,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/64KB",
            "value": 127,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "node_startup",
            "value": 2515615356,
            "range": "± 67729184",
            "unit": "ns/iter"
          },
          {
            "name": "node_shutdown",
            "value": 2358170311,
            "range": "± 3363957",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/2",
            "value": 4826100137,
            "range": "± 29447476",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/3",
            "value": 7256504150,
            "range": "± 216050839",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/5",
            "value": 12074326230,
            "range": "± 47016153",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/10",
            "value": 24144754676,
            "range": "± 344941230",
            "unit": "ns/iter"
          },
          {
            "name": "chain_store_access",
            "value": 3,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "connection_manager_access",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_info",
            "value": 165776,
            "range": "± 1365",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_sync_status",
            "value": 654774,
            "range": "± 2386",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_chain_stats",
            "value": 167857,
            "range": "± 957",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_peers",
            "value": 161205,
            "range": "± 1301",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/list_spaces",
            "value": 162549,
            "range": "± 1735",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/feed_poll",
            "value": 991780,
            "range": "± 5568",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/create_space",
            "value": 7903438,
            "range": "± 1350136",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/submit_post",
            "value": 20349536,
            "range": "± 1231609",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/list_space_content_populated",
            "value": 3974793,
            "range": "± 14029",
            "unit": "ns/iter"
          },
          {
            "name": "keypair_generation",
            "value": 18664,
            "range": "± 117",
            "unit": "ns/iter"
          },
          {
            "name": "sign_32bytes",
            "value": 36951,
            "range": "± 38",
            "unit": "ns/iter"
          },
          {
            "name": "sign_1kb",
            "value": 41101,
            "range": "± 26",
            "unit": "ns/iter"
          },
          {
            "name": "verify_signature",
            "value": 42871,
            "range": "± 28",
            "unit": "ns/iter"
          },
          {
            "name": "encode_address",
            "value": 333,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decode_address",
            "value": 482,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/8",
            "value": 36516,
            "range": "± 256",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/12",
            "value": 297797,
            "range": "± 8620",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/16",
            "value": 4307031,
            "range": "± 311567",
            "unit": "ns/iter"
          },
          {
            "name": "encrypt_private_key",
            "value": 86104787,
            "range": "± 986768",
            "unit": "ns/iter"
          },
          {
            "name": "decrypt_private_key",
            "value": 85964131,
            "range": "± 77720",
            "unit": "ns/iter"
          },
          {
            "name": "export_identity",
            "value": 86206580,
            "range": "± 116300",
            "unit": "ns/iter"
          },
          {
            "name": "import_identity",
            "value": 86086533,
            "range": "± 102252",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_1mib",
            "value": 389747,
            "range": "± 302",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/4",
            "value": 6482858,
            "range": "± 1296760",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/8",
            "value": 62917446,
            "range": "± 76059545",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/10",
            "value": 402459080,
            "range": "± 340262569",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/12",
            "value": 758612532,
            "range": "± 2119535998",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_64mib",
            "value": 88676491,
            "range": "± 91144",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_mobile",
            "value": 88049675,
            "range": "± 277740",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/test_1mib",
            "value": 389593,
            "range": "± 244",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/mobile_64mib_p2",
            "value": 88035603,
            "range": "± 3445653",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/prod_64mib_p4",
            "value": 88758247,
            "range": "± 723987",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/100",
            "value": 1664380,
            "range": "± 23517",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/500",
            "value": 5400027,
            "range": "± 17920",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/1000",
            "value": 10662525,
            "range": "± 58528",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/100",
            "value": 230,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/1000",
            "value": 247,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/5000",
            "value": 317,
            "range": "± 5",
            "unit": "ns/iter"
          },
          {
            "name": "insert_with_branch/insert_default_threshold",
            "value": 22770,
            "range": "± 1408",
            "unit": "ns/iter"
          },
          {
            "name": "insert_with_branch/insert_small_threshold",
            "value": 98346,
            "range": "± 12470",
            "unit": "ns/iter"
          },
          {
            "name": "space_state_lookup/get_space_branch_state",
            "value": 229,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "hash_branch_matching/assign_branch_unfractured",
            "value": 210,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "hash_branch_matching/assign_branch_fractured",
            "value": 246,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/2MB",
            "value": 1392737,
            "range": "± 972",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/10MB",
            "value": 10917364,
            "range": "± 7263",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/50MB",
            "value": 56536320,
            "range": "± 914614",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/100MB",
            "value": 112798404,
            "range": "± 754866",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/2MB",
            "value": 2740123,
            "range": "± 22742",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/10MB",
            "value": 13727209,
            "range": "± 137503",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/50MB",
            "value": 89892804,
            "range": "± 428121",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/2MB",
            "value": 1505134,
            "range": "± 880",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/10MB",
            "value": 7489731,
            "range": "± 8768",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/50MB",
            "value": 39920393,
            "range": "± 204876",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/2",
            "value": 792,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/10",
            "value": 3210,
            "range": "± 22",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/50",
            "value": 15005,
            "range": "± 34",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/100",
            "value": 29521,
            "range": "± 47",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/500",
            "value": 144643,
            "range": "± 167",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/1024",
            "value": 295403,
            "range": "± 850",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/2",
            "value": 848,
            "range": "± 5",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/10",
            "value": 3708,
            "range": "± 7",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/50",
            "value": 17362,
            "range": "± 23",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/100",
            "value": 34491,
            "range": "± 60",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/500",
            "value": 169931,
            "range": "± 844",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/1024",
            "value": 348232,
            "range": "± 460",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/1MB",
            "value": 697372,
            "range": "± 470",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/10MB",
            "value": 6970089,
            "range": "± 2739",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/100MB",
            "value": 109136949,
            "range": "± 302218",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/500MB",
            "value": 559041923,
            "range": "± 2385877",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/1024MB",
            "value": 1153073654,
            "range": "± 9970328",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/10",
            "value": 34066,
            "range": "± 98",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/50",
            "value": 138282,
            "range": "± 242",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/100",
            "value": 261461,
            "range": "± 655",
            "unit": "ns/iter"
          },
          {
            "name": "decay_simulation/10k_posts_60_days",
            "value": 18054577,
            "range": "± 573032",
            "unit": "ns/iter"
          },
          {
            "name": "decay_simulation_large/100k_posts_60_days",
            "value": 200606455,
            "range": "± 590249",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/1000",
            "value": 26,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/10000",
            "value": 53118,
            "range": "± 381",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/50000",
            "value": 241574,
            "range": "± 3188",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/100",
            "value": 29180,
            "range": "± 31",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/1000",
            "value": 310489,
            "range": "± 1174",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/10000",
            "value": 2976319,
            "range": "± 6845",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/100000",
            "value": 29629274,
            "range": "± 38493",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/1000",
            "value": 1608,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/10000",
            "value": 25460,
            "range": "± 55",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/100000",
            "value": 197695,
            "range": "± 959",
            "unit": "ns/iter"
          },
          {
            "name": "header_hash",
            "value": 303,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "meets_difficulty",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Budget_1GB",
            "value": 2931263,
            "range": "± 37563",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Standard_5GB",
            "value": 15490879,
            "range": "± 93817",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Flagship_10GB",
            "value": 32567214,
            "range": "± 474664",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/50",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/75",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/90",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/95",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/99",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/1KB",
            "value": 429099,
            "range": "± 23636",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/10KB",
            "value": 465190,
            "range": "± 46987",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/100KB",
            "value": 670149,
            "range": "± 110913",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/100",
            "value": 1397,
            "range": "± 37",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/1000",
            "value": 16278,
            "range": "± 414",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/10000",
            "value": 211807,
            "range": "± 3262",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/steady_state",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/daily_growth",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/avg_post_size",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/10_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/100_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/1000_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/10000_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/budget_1gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/standard_5gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/flagship_10gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/root_block",
            "value": 4814,
            "range": "± 476",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/space_block",
            "value": 625,
            "range": "± 7",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/content_block",
            "value": 584,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/1024",
            "value": 10175,
            "range": "± 8827",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/4096",
            "value": 18267,
            "range": "± 15622",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/65536",
            "value": 153516,
            "range": "± 66532",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/1048576",
            "value": 2125574,
            "range": "± 111969",
            "unit": "ns/iter"
          },
          {
            "name": "random_read/root_block_1000",
            "value": 691,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/1024_bytes",
            "value": 8383,
            "range": "± 9",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/65536_bytes",
            "value": 51846,
            "range": "± 172",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/1048576_bytes",
            "value": 731712,
            "range": "± 2076",
            "unit": "ns/iter"
          },
          {
            "name": "cache/add_entry",
            "value": 556,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "cache/access",
            "value": 264,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/100",
            "value": 28740,
            "range": "± 230",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/1000",
            "value": 52900,
            "range": "± 870",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/10000",
            "value": 53325,
            "range": "± 429",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/1048576_bytes",
            "value": 703071,
            "range": "± 638",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/5242880_bytes",
            "value": 3517486,
            "range": "± 6220",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/10485760_bytes",
            "value": 7083754,
            "range": "± 50879",
            "unit": "ns/iter"
          },
          {
            "name": "startup/empty_db",
            "value": 2275289,
            "range": "± 78342",
            "unit": "ns/iter"
          },
          {
            "name": "startup/populated_db",
            "value": 6157368,
            "range": "± 109772",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/100",
            "value": 516054,
            "range": "± 47021",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/1000",
            "value": 660304,
            "range": "± 24075",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/10000",
            "value": 668321,
            "range": "± 25314",
            "unit": "ns/iter"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "admin@adminwizard.tech",
            "name": "AdminWizard"
          },
          "committer": {
            "email": "admin@adminwizard.tech",
            "name": "AdminWizard"
          },
          "distinct": true,
          "id": "2147d8c3da5cb0a3d2c6ee8736bfd5da6cf67c5a",
          "message": "fix(sponsorship): anchor claim claimed_at to the signed timestamp so claims propagate\n\nSame class of bug as offer created_at: claim_sponsorship_offer verified the\nclaimant signature over params.timestamp but stored the claim with\nclaimed_at = server current_time. Peers re-verify a propagated claim via\nSponsorshipClaim::signature_message(), which derives the signed timestamp from\nclaimed_at — so with server time stored there the signature failed on every\nother node, the sponsor never saw the claim (0 pending claims), and auto-approve\nonboarding stalled. Anchor claimed_at to params.timestamp.\n\nAdds regression test claim_signature_reverifies_only_when_claimed_at_is_the_signed_timestamp.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>",
          "timestamp": "2026-07-13T08:31:41-04:00",
          "tree_id": "81f5b9e10282eb211a205ba2d1ff143c138429eb",
          "url": "https://github.com/superness/swimchain/commit/2147d8c3da5cb0a3d2c6ee8736bfd5da6cf67c5a"
        },
        "date": 1783947589589,
        "tool": "cargo",
        "benches": [
          {
            "name": "mobile_single_hash/mobile_64mib_p2",
            "value": 93111073,
            "range": "± 921247",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_single_hash/desktop_64mib_p4",
            "value": 94003042,
            "range": "± 910340",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_single_hash/test_1mib_p1",
            "value": 394145,
            "range": "± 1215",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/4",
            "value": 1366282855,
            "range": "± 1716804231",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/6",
            "value": 5690335965,
            "range": "± 4323313117",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/8",
            "value": 29315041045,
            "range": "± 26431938679",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/4",
            "value": 6763287,
            "range": "± 932124",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/6",
            "value": 22399453,
            "range": "± 8030414",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/8",
            "value": 106814982,
            "range": "± 60540453",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/10",
            "value": 400972839,
            "range": "± 332174716",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/12",
            "value": 1423614643,
            "range": "± 1472838609",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Post",
            "value": 545835606,
            "range": "± 759827864",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Reply",
            "value": 1222234261,
            "range": "± 1034776884",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Engage",
            "value": 830549096,
            "range": "± 832680883",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/3G_2mbps",
            "value": 3041849176,
            "range": "± 1937142",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/4G_10mbps",
            "value": 2985,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/WiFi_50mbps",
            "value": 2990,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/1KB",
            "value": 4717,
            "range": "± 5",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/4KB",
            "value": 1217,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/16KB",
            "value": 364,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/64KB",
            "value": 127,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "node_startup",
            "value": 2425911079,
            "range": "± 58577731",
            "unit": "ns/iter"
          },
          {
            "name": "node_shutdown",
            "value": 2359279234,
            "range": "± 3123680",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/2",
            "value": 4839400539,
            "range": "± 47479458",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/3",
            "value": 7224747842,
            "range": "± 32276735",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/5",
            "value": 12034940928,
            "range": "± 45702096",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/10",
            "value": 24059196905,
            "range": "± 389436744",
            "unit": "ns/iter"
          },
          {
            "name": "chain_store_access",
            "value": 3,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "connection_manager_access",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_info",
            "value": 168305,
            "range": "± 2288",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_sync_status",
            "value": 664202,
            "range": "± 16511",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_chain_stats",
            "value": 168354,
            "range": "± 1225",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_peers",
            "value": 159951,
            "range": "± 2188",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/list_spaces",
            "value": 162612,
            "range": "± 2843",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/feed_poll",
            "value": 1000772,
            "range": "± 9248",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/create_space",
            "value": 7714622,
            "range": "± 825455",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/submit_post",
            "value": 20632768,
            "range": "± 1618084",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/list_space_content_populated",
            "value": 4537086,
            "range": "± 16598",
            "unit": "ns/iter"
          },
          {
            "name": "keypair_generation",
            "value": 20943,
            "range": "± 163",
            "unit": "ns/iter"
          },
          {
            "name": "sign_32bytes",
            "value": 41357,
            "range": "± 327",
            "unit": "ns/iter"
          },
          {
            "name": "sign_1kb",
            "value": 45674,
            "range": "± 500",
            "unit": "ns/iter"
          },
          {
            "name": "verify_signature",
            "value": 42516,
            "range": "± 109",
            "unit": "ns/iter"
          },
          {
            "name": "encode_address",
            "value": 361,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "decode_address",
            "value": 530,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/8",
            "value": 40435,
            "range": "± 200",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/12",
            "value": 334255,
            "range": "± 19652",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/16",
            "value": 4712822,
            "range": "± 577805",
            "unit": "ns/iter"
          },
          {
            "name": "encrypt_private_key",
            "value": 98944421,
            "range": "± 1735064",
            "unit": "ns/iter"
          },
          {
            "name": "decrypt_private_key",
            "value": 99931713,
            "range": "± 2068974",
            "unit": "ns/iter"
          },
          {
            "name": "export_identity",
            "value": 99880902,
            "range": "± 3110747",
            "unit": "ns/iter"
          },
          {
            "name": "import_identity",
            "value": 98438856,
            "range": "± 552025",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_1mib",
            "value": 391417,
            "range": "± 4940",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/4",
            "value": 6417757,
            "range": "± 1003384",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/8",
            "value": 70767474,
            "range": "± 31653959",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/10",
            "value": 306328581,
            "range": "± 492860374",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/12",
            "value": 1916745000,
            "range": "± 1799624582",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_64mib",
            "value": 104345552,
            "range": "± 2908727",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_mobile",
            "value": 101254902,
            "range": "± 2330551",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/test_1mib",
            "value": 389975,
            "range": "± 4988",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/mobile_64mib_p2",
            "value": 103063575,
            "range": "± 3327274",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/prod_64mib_p4",
            "value": 102810028,
            "range": "± 1779680",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/100",
            "value": 1768977,
            "range": "± 37460",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/500",
            "value": 6255664,
            "range": "± 106089",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/1000",
            "value": 12427809,
            "range": "± 186765",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/100",
            "value": 279,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/1000",
            "value": 290,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/5000",
            "value": 368,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "insert_with_branch/insert_default_threshold",
            "value": 24777,
            "range": "± 1632",
            "unit": "ns/iter"
          },
          {
            "name": "insert_with_branch/insert_small_threshold",
            "value": 112775,
            "range": "± 19574",
            "unit": "ns/iter"
          },
          {
            "name": "space_state_lookup/get_space_branch_state",
            "value": 314,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "hash_branch_matching/assign_branch_unfractured",
            "value": 256,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "hash_branch_matching/assign_branch_fractured",
            "value": 341,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/2MB",
            "value": 1561070,
            "range": "± 3085",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/10MB",
            "value": 13177396,
            "range": "± 128213",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/50MB",
            "value": 65848743,
            "range": "± 707263",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/100MB",
            "value": 129822800,
            "range": "± 496274",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/2MB",
            "value": 3078909,
            "range": "± 19189",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/10MB",
            "value": 15742635,
            "range": "± 114065",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/50MB",
            "value": 103120345,
            "range": "± 1004391",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/2MB",
            "value": 1692450,
            "range": "± 3657",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/10MB",
            "value": 8565953,
            "range": "± 49360",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/50MB",
            "value": 44363076,
            "range": "± 107300",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/2",
            "value": 718,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/10",
            "value": 2980,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/50",
            "value": 13477,
            "range": "± 29",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/100",
            "value": 26588,
            "range": "± 307",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/500",
            "value": 128450,
            "range": "± 819",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/1024",
            "value": 264385,
            "range": "± 331",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/2",
            "value": 874,
            "range": "± 14",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/10",
            "value": 3823,
            "range": "± 26",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/50",
            "value": 17888,
            "range": "± 410",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/100",
            "value": 35618,
            "range": "± 717",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/500",
            "value": 174478,
            "range": "± 172",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/1024",
            "value": 357125,
            "range": "± 315",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/1MB",
            "value": 780175,
            "range": "± 2023",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/10MB",
            "value": 8063130,
            "range": "± 35647",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/100MB",
            "value": 125325228,
            "range": "± 1181649",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/500MB",
            "value": 641106736,
            "range": "± 2528805",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/1024MB",
            "value": 1317585655,
            "range": "± 9968272",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/10",
            "value": 37660,
            "range": "± 62",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/50",
            "value": 145326,
            "range": "± 1475",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/100",
            "value": 280934,
            "range": "± 816",
            "unit": "ns/iter"
          },
          {
            "name": "decay_simulation/10k_posts_60_days",
            "value": 23242148,
            "range": "± 428787",
            "unit": "ns/iter"
          },
          {
            "name": "decay_simulation_large/100k_posts_60_days",
            "value": 247958102,
            "range": "± 6085129",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/1000",
            "value": 30,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/10000",
            "value": 48777,
            "range": "± 568",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/50000",
            "value": 224468,
            "range": "± 3115",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/100",
            "value": 33398,
            "range": "± 300",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/1000",
            "value": 330525,
            "range": "± 194",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/10000",
            "value": 3324785,
            "range": "± 5384",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/100000",
            "value": 32945170,
            "range": "± 24666",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/1000",
            "value": 1874,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/10000",
            "value": 18073,
            "range": "± 62",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/100000",
            "value": 157907,
            "range": "± 3602",
            "unit": "ns/iter"
          },
          {
            "name": "header_hash",
            "value": 336,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "meets_difficulty",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Budget_1GB",
            "value": 3029306,
            "range": "± 24309",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Standard_5GB",
            "value": 17186346,
            "range": "± 206381",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Flagship_10GB",
            "value": 37095502,
            "range": "± 481065",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/50",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/75",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/90",
            "value": 3,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/95",
            "value": 3,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/99",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/1KB",
            "value": 339224,
            "range": "± 18864",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/10KB",
            "value": 395292,
            "range": "± 26502",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/100KB",
            "value": 624251,
            "range": "± 25119",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/100",
            "value": 1445,
            "range": "± 8",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/1000",
            "value": 15556,
            "range": "± 131",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/10000",
            "value": 248222,
            "range": "± 1669",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_7",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_14",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_30",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_60",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_90",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_7",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_14",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_30",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_60",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_90",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_7",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_14",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_30",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_60",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_90",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/steady_state",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/daily_growth",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/avg_post_size",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/10_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/100_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/1000_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/10000_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/budget_1gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/standard_5gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/flagship_10gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/root_block",
            "value": 5528,
            "range": "± 630",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/space_block",
            "value": 651,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/content_block",
            "value": 648,
            "range": "± 6",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/1024",
            "value": 5112,
            "range": "± 3332",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/4096",
            "value": 12585,
            "range": "± 7373",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/65536",
            "value": 153381,
            "range": "± 59134",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/1048576",
            "value": 2469281,
            "range": "± 137587",
            "unit": "ns/iter"
          },
          {
            "name": "random_read/root_block_1000",
            "value": 562,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/1024_bytes",
            "value": 4405,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/65536_bytes",
            "value": 56849,
            "range": "± 580",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/1048576_bytes",
            "value": 907033,
            "range": "± 2871",
            "unit": "ns/iter"
          },
          {
            "name": "cache/add_entry",
            "value": 636,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "cache/access",
            "value": 287,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/100",
            "value": 29216,
            "range": "± 39",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/1000",
            "value": 52300,
            "range": "± 155",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/10000",
            "value": 52291,
            "range": "± 95",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/1048576_bytes",
            "value": 842528,
            "range": "± 2867",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/5242880_bytes",
            "value": 4497204,
            "range": "± 52564",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/10485760_bytes",
            "value": 9317768,
            "range": "± 78716",
            "unit": "ns/iter"
          },
          {
            "name": "startup/empty_db",
            "value": 2027649,
            "range": "± 55928",
            "unit": "ns/iter"
          },
          {
            "name": "startup/populated_db",
            "value": 4036522,
            "range": "± 615352",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/100",
            "value": 389568,
            "range": "± 5456",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/1000",
            "value": 493257,
            "range": "± 18630",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/10000",
            "value": 508962,
            "range": "± 11602",
            "unit": "ns/iter"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "admin@adminwizard.tech",
            "name": "AdminWizard"
          },
          "committer": {
            "email": "admin@adminwizard.tech",
            "name": "AdminWizard"
          },
          "distinct": true,
          "id": "12f71f55c861c24f685f05a2e832d90c53819443",
          "message": "fix(sponsorship): re-broadcast pending claims until sponsored (F7)\n\nClaims are delivered by a single broadcast at submit time and are neither\nrelayed nor pull-synced by peers, so a claim can silently fail to reach its\nsponsor (e.g. a mobile node whose broadcast fan-out excluded the sponsor),\nstalling onboarding with no error. Add a claimant-side background task that,\nuntil this node is sponsored, periodically (30s) re-broadcasts its own\nstill-pending claims so the sponsor eventually receives one and approves it.\nThe task stops once sponsorship_store shows the node as sponsored.\n\nAdds OfferStore::get_own_pending_claims + test test_get_own_pending_claims.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>",
          "timestamp": "2026-07-13T09:30:00-04:00",
          "tree_id": "2377f461a980961610c489faa1a34d970d771997",
          "url": "https://github.com/superness/swimchain/commit/12f71f55c861c24f685f05a2e832d90c53819443"
        },
        "date": 1783950916472,
        "tool": "cargo",
        "benches": [
          {
            "name": "mobile_single_hash/mobile_64mib_p2",
            "value": 94558468,
            "range": "± 492837",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_single_hash/desktop_64mib_p4",
            "value": 94386320,
            "range": "± 739923",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_single_hash/test_1mib_p1",
            "value": 395091,
            "range": "± 563",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/4",
            "value": 758930388,
            "range": "± 1138649472",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/6",
            "value": 2470879918,
            "range": "± 4699951922",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/8",
            "value": 15685160845,
            "range": "± 23291845234",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/4",
            "value": 6476571,
            "range": "± 1268971",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/6",
            "value": 31018024,
            "range": "± 11282407",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/8",
            "value": 80411643,
            "range": "± 35006924",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/10",
            "value": 252166126,
            "range": "± 375348777",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/12",
            "value": 498514507,
            "range": "± 1918876216",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Post",
            "value": 937032976,
            "range": "± 990009385",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Reply",
            "value": 658066956,
            "range": "± 795420437",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Engage",
            "value": 524183860,
            "range": "± 683463781",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/3G_2mbps",
            "value": 3039125991,
            "range": "± 2722662",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/4G_10mbps",
            "value": 2985,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/WiFi_50mbps",
            "value": 2991,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/1KB",
            "value": 4717,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/4KB",
            "value": 1218,
            "range": "± 15",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/16KB",
            "value": 364,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/64KB",
            "value": 127,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "node_startup",
            "value": 2540024361,
            "range": "± 65571850",
            "unit": "ns/iter"
          },
          {
            "name": "node_shutdown",
            "value": 2359319032,
            "range": "± 1702648",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/2",
            "value": 4875384817,
            "range": "± 113178154",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/3",
            "value": 7330626521,
            "range": "± 70126077",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/5",
            "value": 12188305639,
            "range": "± 162783923",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/10",
            "value": 24287847111,
            "range": "± 402219620",
            "unit": "ns/iter"
          },
          {
            "name": "chain_store_access",
            "value": 3,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "connection_manager_access",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_info",
            "value": 169095,
            "range": "± 1878",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_sync_status",
            "value": 657181,
            "range": "± 1806",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_chain_stats",
            "value": 170053,
            "range": "± 2050",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_peers",
            "value": 161629,
            "range": "± 1766",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/list_spaces",
            "value": 164375,
            "range": "± 2452",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/feed_poll",
            "value": 997352,
            "range": "± 2653",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/create_space",
            "value": 8211943,
            "range": "± 1730988",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/submit_post",
            "value": 20822048,
            "range": "± 1930458",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/list_space_content_populated",
            "value": 4050183,
            "range": "± 21204",
            "unit": "ns/iter"
          },
          {
            "name": "keypair_generation",
            "value": 18663,
            "range": "± 14",
            "unit": "ns/iter"
          },
          {
            "name": "sign_32bytes",
            "value": 37018,
            "range": "± 83",
            "unit": "ns/iter"
          },
          {
            "name": "sign_1kb",
            "value": 41149,
            "range": "± 57",
            "unit": "ns/iter"
          },
          {
            "name": "verify_signature",
            "value": 43985,
            "range": "± 49",
            "unit": "ns/iter"
          },
          {
            "name": "encode_address",
            "value": 334,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decode_address",
            "value": 489,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/8",
            "value": 36438,
            "range": "± 223",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/12",
            "value": 303773,
            "range": "± 11524",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/16",
            "value": 4545675,
            "range": "± 777622",
            "unit": "ns/iter"
          },
          {
            "name": "encrypt_private_key",
            "value": 86766140,
            "range": "± 969464",
            "unit": "ns/iter"
          },
          {
            "name": "decrypt_private_key",
            "value": 86736011,
            "range": "± 741020",
            "unit": "ns/iter"
          },
          {
            "name": "export_identity",
            "value": 86672085,
            "range": "± 479591",
            "unit": "ns/iter"
          },
          {
            "name": "import_identity",
            "value": 85904332,
            "range": "± 159021",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_1mib",
            "value": 389719,
            "range": "± 602",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/4",
            "value": 6331094,
            "range": "± 555516",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/8",
            "value": 89520882,
            "range": "± 72813689",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/10",
            "value": 355585886,
            "range": "± 506178026",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/12",
            "value": 1252003789,
            "range": "± 2008978617",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_64mib",
            "value": 88878198,
            "range": "± 268759",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_mobile",
            "value": 88587356,
            "range": "± 481634",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/test_1mib",
            "value": 389728,
            "range": "± 324",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/mobile_64mib_p2",
            "value": 88318380,
            "range": "± 288695",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/prod_64mib_p4",
            "value": 89109893,
            "range": "± 881123",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/100",
            "value": 1670947,
            "range": "± 14249",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/500",
            "value": 5359504,
            "range": "± 30931",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/1000",
            "value": 10447683,
            "range": "± 184411",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/100",
            "value": 233,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/1000",
            "value": 243,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/5000",
            "value": 320,
            "range": "± 6",
            "unit": "ns/iter"
          },
          {
            "name": "insert_with_branch/insert_default_threshold",
            "value": 22227,
            "range": "± 1446",
            "unit": "ns/iter"
          },
          {
            "name": "insert_with_branch/insert_small_threshold",
            "value": 104144,
            "range": "± 11413",
            "unit": "ns/iter"
          },
          {
            "name": "space_state_lookup/get_space_branch_state",
            "value": 228,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "hash_branch_matching/assign_branch_unfractured",
            "value": 209,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "hash_branch_matching/assign_branch_fractured",
            "value": 252,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/2MB",
            "value": 1391843,
            "range": "± 614",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/10MB",
            "value": 10866588,
            "range": "± 125457",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/50MB",
            "value": 56698235,
            "range": "± 147162",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/100MB",
            "value": 113568002,
            "range": "± 106313",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/2MB",
            "value": 2736221,
            "range": "± 23100",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/10MB",
            "value": 13672676,
            "range": "± 110423",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/50MB",
            "value": 89947918,
            "range": "± 382335",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/2MB",
            "value": 1505444,
            "range": "± 2144",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/10MB",
            "value": 7494097,
            "range": "± 11009",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/50MB",
            "value": 39965676,
            "range": "± 189241",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/2",
            "value": 786,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/10",
            "value": 3262,
            "range": "± 12",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/50",
            "value": 15249,
            "range": "± 12",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/100",
            "value": 29469,
            "range": "± 34",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/500",
            "value": 144974,
            "range": "± 829",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/1024",
            "value": 296050,
            "range": "± 520",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/2",
            "value": 850,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/10",
            "value": 3714,
            "range": "± 8",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/50",
            "value": 18398,
            "range": "± 79",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/100",
            "value": 35756,
            "range": "± 1594",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/500",
            "value": 171788,
            "range": "± 833",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/1024",
            "value": 349479,
            "range": "± 537",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/1MB",
            "value": 696094,
            "range": "± 383",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/10MB",
            "value": 6964350,
            "range": "± 2566",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/100MB",
            "value": 109689980,
            "range": "± 160019",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/500MB",
            "value": 558445434,
            "range": "± 2690830",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/1024MB",
            "value": 1147046355,
            "range": "± 1586678",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/10",
            "value": 32704,
            "range": "± 129",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/50",
            "value": 132318,
            "range": "± 641",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/100",
            "value": 253067,
            "range": "± 849",
            "unit": "ns/iter"
          },
          {
            "name": "decay_simulation/10k_posts_60_days",
            "value": 16122077,
            "range": "± 327164",
            "unit": "ns/iter"
          },
          {
            "name": "decay_simulation_large/100k_posts_60_days",
            "value": 199906049,
            "range": "± 2158388",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/1000",
            "value": 27,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/10000",
            "value": 51951,
            "range": "± 409",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/50000",
            "value": 240547,
            "range": "± 2661",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/100",
            "value": 29466,
            "range": "± 2577",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/1000",
            "value": 299986,
            "range": "± 274",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/10000",
            "value": 2958246,
            "range": "± 9173",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/100000",
            "value": 29648684,
            "range": "± 93801",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/1000",
            "value": 1640,
            "range": "± 6",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/10000",
            "value": 25444,
            "range": "± 39",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/100000",
            "value": 196905,
            "range": "± 818",
            "unit": "ns/iter"
          },
          {
            "name": "header_hash",
            "value": 297,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "meets_difficulty",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Budget_1GB",
            "value": 2936169,
            "range": "± 32264",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Standard_5GB",
            "value": 15626022,
            "range": "± 383702",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Flagship_10GB",
            "value": 31183807,
            "range": "± 74582",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/50",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/75",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/90",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/95",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/99",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/1KB",
            "value": 394376,
            "range": "± 8222",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/10KB",
            "value": 447601,
            "range": "± 20877",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/100KB",
            "value": 619239,
            "range": "± 20006",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/100",
            "value": 1404,
            "range": "± 7",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/1000",
            "value": 16574,
            "range": "± 836",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/10000",
            "value": 211067,
            "range": "± 1105",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/steady_state",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/daily_growth",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/avg_post_size",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/10_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/100_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/1000_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/10000_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/budget_1gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/standard_5gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/flagship_10gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/root_block",
            "value": 4742,
            "range": "± 377",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/space_block",
            "value": 629,
            "range": "± 22",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/content_block",
            "value": 599,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/1024",
            "value": 9434,
            "range": "± 8188",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/4096",
            "value": 18126,
            "range": "± 16108",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/65536",
            "value": 150209,
            "range": "± 68034",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/1048576",
            "value": 2138137,
            "range": "± 101068",
            "unit": "ns/iter"
          },
          {
            "name": "random_read/root_block_1000",
            "value": 688,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/1024_bytes",
            "value": 8586,
            "range": "± 8",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/65536_bytes",
            "value": 51676,
            "range": "± 63",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/1048576_bytes",
            "value": 725615,
            "range": "± 4022",
            "unit": "ns/iter"
          },
          {
            "name": "cache/add_entry",
            "value": 569,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "cache/access",
            "value": 267,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/100",
            "value": 28637,
            "range": "± 126",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/1000",
            "value": 53390,
            "range": "± 232",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/10000",
            "value": 53741,
            "range": "± 251",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/1048576_bytes",
            "value": 696515,
            "range": "± 1433",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/5242880_bytes",
            "value": 3500829,
            "range": "± 1961",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/10485760_bytes",
            "value": 7008183,
            "range": "± 17424",
            "unit": "ns/iter"
          },
          {
            "name": "startup/empty_db",
            "value": 2314568,
            "range": "± 66857",
            "unit": "ns/iter"
          },
          {
            "name": "startup/populated_db",
            "value": 6145902,
            "range": "± 61397",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/100",
            "value": 495855,
            "range": "± 11115",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/1000",
            "value": 633179,
            "range": "± 10398",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/10000",
            "value": 623577,
            "range": "± 7800",
            "unit": "ns/iter"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "admin@adminwizard.tech",
            "name": "AdminWizard"
          },
          "committer": {
            "email": "admin@adminwizard.tech",
            "name": "AdminWizard"
          },
          "distinct": true,
          "id": "bf13aea331047efe4a604981a9d02e7d18fdd64c",
          "message": "fix(sponsorship): claim re-broadcast must match on raw pubkey, not node_id\n\nThe claim re-broadcast task compared claims against node_id() (SHA256 of the\npublic key) instead of the raw public key, so get_own_pending_claims never\nmatched the claimant and nothing was re-broadcast. Thread the raw identity\npublic key through spawn_all_with_routing and use it for the claimant match.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>",
          "timestamp": "2026-07-13T09:39:26-04:00",
          "tree_id": "d552cdc3d92426ca9d3530ed58d60630504e9ce3",
          "url": "https://github.com/superness/swimchain/commit/bf13aea331047efe4a604981a9d02e7d18fdd64c"
        },
        "date": 1783952598946,
        "tool": "cargo",
        "benches": [
          {
            "name": "mobile_single_hash/mobile_64mib_p2",
            "value": 100668693,
            "range": "± 836651",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_single_hash/desktop_64mib_p4",
            "value": 100213316,
            "range": "± 788617",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_single_hash/test_1mib_p1",
            "value": 388700,
            "range": "± 555",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/4",
            "value": 2178707734,
            "range": "± 3761017223",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/6",
            "value": 2538706833,
            "range": "± 6394039952",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_mining/8",
            "value": 23957510007,
            "range": "± 28138862937",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/4",
            "value": 6441945,
            "range": "± 1283997",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/6",
            "value": 25936117,
            "range": "± 5657725",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/8",
            "value": 89197742,
            "range": "± 26468331",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/10",
            "value": 224909602,
            "range": "± 323398146",
            "unit": "ns/iter"
          },
          {
            "name": "test_config_mining/12",
            "value": 1016886317,
            "range": "± 2252111217",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Post",
            "value": 1400274885,
            "range": "± 2569220193",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Reply",
            "value": 2370502392,
            "range": "± 1196514966",
            "unit": "ns/iter"
          },
          {
            "name": "mobile_action_types/Engage",
            "value": 1787049800,
            "range": "± 1480139324",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/3G_2mbps",
            "value": 3034843271,
            "range": "± 1647960",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/4G_10mbps",
            "value": 3289,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "header_sync/WiFi_50mbps",
            "value": 3410,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/1KB",
            "value": 5179,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/4KB",
            "value": 1348,
            "range": "± 14",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/16KB",
            "value": 403,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_transfer/64KB",
            "value": 141,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/3G_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/4G_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_1k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_10k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "theoretical_sync/WiFi_100k_headers",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "node_startup",
            "value": 2495351539,
            "range": "± 53039093",
            "unit": "ns/iter"
          },
          {
            "name": "node_shutdown",
            "value": 2358814483,
            "range": "± 2790137",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/2",
            "value": 4862636261,
            "range": "± 60786253",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/3",
            "value": 7291490605,
            "range": "± 82469517",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/5",
            "value": 12152466555,
            "range": "± 94963688",
            "unit": "ns/iter"
          },
          {
            "name": "harness_creation/10",
            "value": 24336265307,
            "range": "± 498671691",
            "unit": "ns/iter"
          },
          {
            "name": "chain_store_access",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "connection_manager_access",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_info",
            "value": 147510,
            "range": "± 3742",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_sync_status",
            "value": 707136,
            "range": "± 8275",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_chain_stats",
            "value": 147190,
            "range": "± 5633",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/get_peers",
            "value": 140710,
            "range": "± 2730",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_read/list_spaces",
            "value": 141258,
            "range": "± 2965",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/feed_poll",
            "value": 1018672,
            "range": "± 8277",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/create_space",
            "value": 7768473,
            "range": "± 1225395",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/submit_post",
            "value": 19381582,
            "range": "± 2342839",
            "unit": "ns/iter"
          },
          {
            "name": "rpc_use_case/list_space_content_populated",
            "value": 5341685,
            "range": "± 71931",
            "unit": "ns/iter"
          },
          {
            "name": "keypair_generation",
            "value": 21301,
            "range": "± 147",
            "unit": "ns/iter"
          },
          {
            "name": "sign_32bytes",
            "value": 41243,
            "range": "± 38",
            "unit": "ns/iter"
          },
          {
            "name": "sign_1kb",
            "value": 45732,
            "range": "± 55",
            "unit": "ns/iter"
          },
          {
            "name": "verify_signature",
            "value": 42433,
            "range": "± 54",
            "unit": "ns/iter"
          },
          {
            "name": "encode_address",
            "value": 360,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decode_address",
            "value": 530,
            "range": "± 7",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/8",
            "value": 40689,
            "range": "± 251",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/12",
            "value": 332408,
            "range": "± 11305",
            "unit": "ns/iter"
          },
          {
            "name": "pow_mining/16",
            "value": 5582048,
            "range": "± 893082",
            "unit": "ns/iter"
          },
          {
            "name": "encrypt_private_key",
            "value": 94191725,
            "range": "± 1527896",
            "unit": "ns/iter"
          },
          {
            "name": "decrypt_private_key",
            "value": 94044821,
            "range": "± 393172",
            "unit": "ns/iter"
          },
          {
            "name": "export_identity",
            "value": 96337194,
            "range": "± 4264657",
            "unit": "ns/iter"
          },
          {
            "name": "import_identity",
            "value": 93947135,
            "range": "± 557240",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_1mib",
            "value": 392014,
            "range": "± 8588",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/4",
            "value": 6179267,
            "range": "± 626385",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/8",
            "value": 88711555,
            "range": "± 94452705",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/10",
            "value": 103713147,
            "range": "± 281126687",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_mining_test/12",
            "value": 1616119191,
            "range": "± 1128747913",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_64mib",
            "value": 97669138,
            "range": "± 870132",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_verify_mobile",
            "value": 97170779,
            "range": "± 796788",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/test_1mib",
            "value": 391531,
            "range": "± 486",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/mobile_64mib_p2",
            "value": 96139895,
            "range": "± 3189087",
            "unit": "ns/iter"
          },
          {
            "name": "action_pow_config_comparison/prod_64mib_p4",
            "value": 98616625,
            "range": "± 1311707",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/100",
            "value": 1628534,
            "range": "± 10649",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/500",
            "value": 5573868,
            "range": "± 31817",
            "unit": "ns/iter"
          },
          {
            "name": "fracture_overhead/threads/1000",
            "value": 11042457,
            "range": "± 661902",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/100",
            "value": 260,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/1000",
            "value": 274,
            "range": "± 5",
            "unit": "ns/iter"
          },
          {
            "name": "branch_lookup/threads/5000",
            "value": 355,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "insert_with_branch/insert_default_threshold",
            "value": 23144,
            "range": "± 1517",
            "unit": "ns/iter"
          },
          {
            "name": "insert_with_branch/insert_small_threshold",
            "value": 100721,
            "range": "± 12552",
            "unit": "ns/iter"
          },
          {
            "name": "space_state_lookup/get_space_branch_state",
            "value": 261,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "hash_branch_matching/assign_branch_unfractured",
            "value": 244,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "hash_branch_matching/assign_branch_fractured",
            "value": 285,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/2MB",
            "value": 1553970,
            "range": "± 2348",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/10MB",
            "value": 12672880,
            "range": "± 22848",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/50MB",
            "value": 65380174,
            "range": "± 293793",
            "unit": "ns/iter"
          },
          {
            "name": "chunk_data/size/100MB",
            "value": 130910456,
            "range": "± 1079665",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/2MB",
            "value": 3081780,
            "range": "± 22298",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/10MB",
            "value": 15456487,
            "range": "± 122158",
            "unit": "ns/iter"
          },
          {
            "name": "store_chunked/size/50MB",
            "value": 102964193,
            "range": "± 444964",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/2MB",
            "value": 1686781,
            "range": "± 1665",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/10MB",
            "value": 8433722,
            "range": "± 12638",
            "unit": "ns/iter"
          },
          {
            "name": "reassemble/size/50MB",
            "value": 44181279,
            "range": "± 78776",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/2",
            "value": 719,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/10",
            "value": 3005,
            "range": "± 6",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/50",
            "value": 14254,
            "range": "± 14",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/100",
            "value": 27902,
            "range": "± 66",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/500",
            "value": 134651,
            "range": "± 1193",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_serialization/chunks/1024",
            "value": 274425,
            "range": "± 300",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/2",
            "value": 865,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/10",
            "value": 3912,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/50",
            "value": 17774,
            "range": "± 42",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/100",
            "value": 35193,
            "range": "± 86",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/500",
            "value": 174031,
            "range": "± 165",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_deserialization/chunks/1024",
            "value": 356410,
            "range": "± 1287",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/1MB",
            "value": 778688,
            "range": "± 320",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/10MB",
            "value": 7848782,
            "range": "± 7916",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/100MB",
            "value": 125450612,
            "range": "± 957865",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/500MB",
            "value": 644364614,
            "range": "± 7074948",
            "unit": "ns/iter"
          },
          {
            "name": "manifest_overhead/file_size/1024MB",
            "value": 1333530380,
            "range": "± 3301685",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/10",
            "value": 37716,
            "range": "± 60",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/50",
            "value": 149076,
            "range": "± 230",
            "unit": "ns/iter"
          },
          {
            "name": "check_availability/chunks/100",
            "value": 286759,
            "range": "± 488",
            "unit": "ns/iter"
          },
          {
            "name": "decay_simulation/10k_posts_60_days",
            "value": 18006982,
            "range": "± 353571",
            "unit": "ns/iter"
          },
          {
            "name": "decay_simulation_large/100k_posts_60_days",
            "value": 230023788,
            "range": "± 3122450",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/1000",
            "value": 31,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/10000",
            "value": 49131,
            "range": "± 564",
            "unit": "ns/iter"
          },
          {
            "name": "prune_tick/50000",
            "value": 221440,
            "range": "± 2992",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/100",
            "value": 31698,
            "range": "± 39",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/1000",
            "value": 329196,
            "range": "± 205",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/10000",
            "value": 3299676,
            "range": "± 3174",
            "unit": "ns/iter"
          },
          {
            "name": "verify_header_chain/100000",
            "value": 32966916,
            "range": "± 59126",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/1000",
            "value": 1852,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/10000",
            "value": 18412,
            "range": "± 147",
            "unit": "ns/iter"
          },
          {
            "name": "identify_relevant_blocks/100000",
            "value": 125867,
            "range": "± 441",
            "unit": "ns/iter"
          },
          {
            "name": "header_hash",
            "value": 348,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "meets_difficulty",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Budget_1GB",
            "value": 2965966,
            "range": "± 21341",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Standard_5GB",
            "value": 16150860,
            "range": "± 360473",
            "unit": "ns/iter"
          },
          {
            "name": "cache_hit_rate/zipf_access/Flagship_10GB",
            "value": 34847554,
            "range": "± 1109534",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/50",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/75",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/90",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/95",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction_overhead/evict_at_fill_pct/99",
            "value": 4,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/1KB",
            "value": 453720,
            "range": "± 35045",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/10KB",
            "value": 525110,
            "range": "± 52138",
            "unit": "ns/iter"
          },
          {
            "name": "caching_store_put/put/100KB",
            "value": 669800,
            "range": "± 27987",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/100",
            "value": 1391,
            "range": "± 32",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/1000",
            "value": 15287,
            "range": "± 483",
            "unit": "ns/iter"
          },
          {
            "name": "statistics_overhead/collect_stats/10000",
            "value": 214353,
            "range": "± 1105",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_12_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_100_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_7",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_14",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_30",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_60",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_projection/users_1000_days_90",
            "value": 1,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/steady_state",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/daily_growth",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "decay_calculation/avg_post_size",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/10_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/100_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/1000_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "user_scale/10000_users",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/budget_1gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/standard_5gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "storage_requirements/flagship_10gb",
            "value": 0,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/root_block",
            "value": 6193,
            "range": "± 863",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/space_block",
            "value": 628,
            "range": "± 5",
            "unit": "ns/iter"
          },
          {
            "name": "sequential_write/content_block",
            "value": 586,
            "range": "± 7",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/1024",
            "value": 10604,
            "range": "± 10286",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/4096",
            "value": 20984,
            "range": "± 20141",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/65536",
            "value": 163117,
            "range": "± 79696",
            "unit": "ns/iter"
          },
          {
            "name": "blob_write/1048576",
            "value": 2192250,
            "range": "± 91647",
            "unit": "ns/iter"
          },
          {
            "name": "random_read/root_block_1000",
            "value": 716,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/1024_bytes",
            "value": 8582,
            "range": "± 31",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/65536_bytes",
            "value": 53363,
            "range": "± 261",
            "unit": "ns/iter"
          },
          {
            "name": "blob_read/1048576_bytes",
            "value": 741483,
            "range": "± 4145",
            "unit": "ns/iter"
          },
          {
            "name": "cache/add_entry",
            "value": 560,
            "range": "± 6",
            "unit": "ns/iter"
          },
          {
            "name": "cache/access",
            "value": 265,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/100",
            "value": 28334,
            "range": "± 153",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/1000",
            "value": 53788,
            "range": "± 279",
            "unit": "ns/iter"
          },
          {
            "name": "eviction/10000",
            "value": 53860,
            "range": "± 222",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/1048576_bytes",
            "value": 703771,
            "range": "± 3785",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/5242880_bytes",
            "value": 3564268,
            "range": "± 12007",
            "unit": "ns/iter"
          },
          {
            "name": "manifest/10485760_bytes",
            "value": 7255875,
            "range": "± 23944",
            "unit": "ns/iter"
          },
          {
            "name": "startup/empty_db",
            "value": 2577265,
            "range": "± 84827",
            "unit": "ns/iter"
          },
          {
            "name": "startup/populated_db",
            "value": 6916437,
            "range": "± 175122",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/100",
            "value": 547043,
            "range": "± 31077",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/1000",
            "value": 685995,
            "range": "± 17890",
            "unit": "ns/iter"
          },
          {
            "name": "cache_persist/10000",
            "value": 684777,
            "range": "± 9437",
            "unit": "ns/iter"
          }
        ]
      }
    ]
  }
}
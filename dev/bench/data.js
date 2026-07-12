window.BENCHMARK_DATA = {
  "lastUpdate": 1783827708624,
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
      }
    ]
  }
}
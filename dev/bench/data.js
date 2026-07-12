window.BENCHMARK_DATA = {
  "lastUpdate": 1783871830255,
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
      }
    ]
  }
}
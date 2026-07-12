window.BENCHMARK_DATA = {
  "lastUpdate": 1783884190875,
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
      }
    ]
  }
}
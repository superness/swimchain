//! Metrics collection for network tests
//!
//! Collects and aggregates metrics from propagation tests for reporting
//! and benchmark documentation.

use super::test_network::PropagationResult;

/// Collected metrics from multiple propagation tests
#[derive(Debug, Default)]
pub struct MetricsCollector {
    /// All propagation results
    results: Vec<PropagationResult>,
    /// Test descriptions
    descriptions: Vec<String>,
}

impl MetricsCollector {
    /// Create a new metrics collector
    pub fn new() -> Self {
        Self::default()
    }

    /// Record a propagation result
    pub fn record(&mut self, result: PropagationResult, description: &str) {
        self.results.push(result);
        self.descriptions.push(description.to_string());
    }

    /// Get all recorded results
    pub fn results(&self) -> &[PropagationResult] {
        &self.results
    }

    /// Calculate aggregate statistics
    pub fn aggregate(&self) -> AggregateMetrics {
        if self.results.is_empty() {
            return AggregateMetrics::default();
        }

        let total = self.results.len();

        let avg_nodes_reached =
            self.results.iter().map(|r| r.nodes_reached).sum::<usize>() as f64 / total as f64;

        let avg_hops =
            self.results.iter().map(|r| r.total_hops).sum::<usize>() as f64 / total as f64;

        let avg_duplicates = self
            .results
            .iter()
            .map(|r| r.duplicates_dropped)
            .sum::<usize>() as f64
            / total as f64;

        let avg_latency_ms = self
            .results
            .iter()
            .map(|r| r.elapsed_simulated_ms)
            .sum::<u64>() as f64
            / total as f64;

        let max_latency_ms = self
            .results
            .iter()
            .map(|r| r.elapsed_simulated_ms)
            .max()
            .unwrap_or(0);

        let min_latency_ms = self
            .results
            .iter()
            .map(|r| r.elapsed_simulated_ms)
            .min()
            .unwrap_or(0);

        let full_propagation_rate = self
            .results
            .iter()
            .filter(|r| r.nodes_reached == 10) // Assuming 10-node network
            .count() as f64
            / total as f64
            * 100.0;

        AggregateMetrics {
            total_tests: total,
            avg_nodes_reached,
            avg_hops,
            avg_duplicates,
            avg_latency_ms,
            max_latency_ms,
            min_latency_ms,
            full_propagation_rate,
        }
    }

    /// Generate a markdown report
    pub fn generate_report(&self) -> String {
        let agg = self.aggregate();

        let mut report = String::new();
        report.push_str("# Network Test Metrics Report\n\n");

        report.push_str("## Summary\n\n");
        report.push_str(&format!("- **Total Tests**: {}\n", agg.total_tests));
        report.push_str(&format!(
            "- **Average Nodes Reached**: {:.1}\n",
            agg.avg_nodes_reached
        ));
        report.push_str(&format!("- **Average Hops**: {:.1}\n", agg.avg_hops));
        report.push_str(&format!(
            "- **Average Duplicates Dropped**: {:.1}\n",
            agg.avg_duplicates
        ));
        report.push_str(&format!(
            "- **Full Propagation Rate**: {:.1}%\n\n",
            agg.full_propagation_rate
        ));

        report.push_str("## Latency\n\n");
        report.push_str(&format!("- **Average**: {:.1}ms\n", agg.avg_latency_ms));
        report.push_str(&format!("- **Maximum**: {}ms\n", agg.max_latency_ms));
        report.push_str(&format!("- **Minimum**: {}ms\n\n", agg.min_latency_ms));

        report.push_str("## Individual Results\n\n");
        report.push_str("| Test | Nodes | Hops | Duplicates | Latency (ms) |\n");
        report.push_str("|------|-------|------|------------|-------------|\n");

        for (i, result) in self.results.iter().enumerate() {
            let desc = self
                .descriptions
                .get(i)
                .map(|s| s.as_str())
                .unwrap_or("Unknown");
            report.push_str(&format!(
                "| {} | {} | {} | {} | {} |\n",
                desc,
                result.nodes_reached,
                result.total_hops,
                result.duplicates_dropped,
                result.elapsed_simulated_ms
            ));
        }

        report
    }

    /// Clear all recorded results
    pub fn clear(&mut self) {
        self.results.clear();
        self.descriptions.clear();
    }
}

/// Aggregate statistics from multiple tests
#[derive(Debug, Default)]
pub struct AggregateMetrics {
    /// Total number of tests run
    pub total_tests: usize,
    /// Average nodes reached per test
    pub avg_nodes_reached: f64,
    /// Average hops per test
    pub avg_hops: f64,
    /// Average duplicates dropped per test
    pub avg_duplicates: f64,
    /// Average latency in milliseconds
    pub avg_latency_ms: f64,
    /// Maximum latency in milliseconds
    pub max_latency_ms: u64,
    /// Minimum latency in milliseconds
    pub min_latency_ms: u64,
    /// Percentage of tests that reached all nodes
    pub full_propagation_rate: f64,
}

/// Builder for running benchmark suites
pub struct BenchmarkSuite {
    /// Name of the benchmark suite
    name: String,
    /// Metrics collector
    collector: MetricsCollector,
}

impl BenchmarkSuite {
    /// Create a new benchmark suite
    pub fn new(name: &str) -> Self {
        Self {
            name: name.to_string(),
            collector: MetricsCollector::new(),
        }
    }

    /// Run a single benchmark and record results
    pub fn run<F>(&mut self, description: &str, mut f: F)
    where
        F: FnMut() -> PropagationResult,
    {
        let result = f();
        self.collector.record(result, description);
    }

    /// Run a benchmark multiple times and record all results
    pub fn run_iterations<F>(&mut self, description: &str, iterations: usize, mut f: F)
    where
        F: FnMut(usize) -> PropagationResult,
    {
        for i in 0..iterations {
            let result = f(i);
            let desc = format!("{} (iter {})", description, i + 1);
            self.collector.record(result, &desc);
        }
    }

    /// Get aggregate metrics
    pub fn metrics(&self) -> AggregateMetrics {
        self.collector.aggregate()
    }

    /// Generate a markdown report
    pub fn report(&self) -> String {
        let mut report = format!("# Benchmark: {}\n\n", self.name);
        report.push_str(&self.collector.generate_report()[22..]); // Skip the header
        report
    }

    /// Get the collector
    pub fn collector(&self) -> &MetricsCollector {
        &self.collector
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mock_result(nodes: usize, hops: usize, latency: u64) -> PropagationResult {
        PropagationResult {
            nodes_reached: nodes,
            total_hops: hops,
            duplicates_dropped: 0,
            ttl_exhausted: 0,
            elapsed_simulated_ms: latency,
            per_node_latency_ms: vec![],
        }
    }

    #[test]
    fn test_empty_collector() {
        let collector = MetricsCollector::new();
        let agg = collector.aggregate();

        assert_eq!(agg.total_tests, 0);
        assert_eq!(agg.avg_latency_ms, 0.0);
    }

    #[test]
    fn test_record_and_aggregate() {
        let mut collector = MetricsCollector::new();

        collector.record(mock_result(10, 9, 100), "Test 1");
        collector.record(mock_result(10, 10, 200), "Test 2");

        let agg = collector.aggregate();

        assert_eq!(agg.total_tests, 2);
        assert_eq!(agg.avg_nodes_reached, 10.0);
        assert_eq!(agg.avg_hops, 9.5);
        assert_eq!(agg.avg_latency_ms, 150.0);
        assert_eq!(agg.max_latency_ms, 200);
        assert_eq!(agg.min_latency_ms, 100);
    }

    #[test]
    fn test_generate_report() {
        let mut collector = MetricsCollector::new();
        collector.record(mock_result(10, 9, 100), "Genesis");

        let report = collector.generate_report();

        assert!(report.contains("# Network Test Metrics Report"));
        assert!(report.contains("Genesis"));
        assert!(report.contains("100"));
    }

    #[test]
    fn test_benchmark_suite() {
        let mut suite = BenchmarkSuite::new("Full Mesh Tests");

        suite.run("Single block", || mock_result(10, 9, 50));
        suite.run("Chain of 5", || mock_result(10, 45, 250));

        let metrics = suite.metrics();
        assert_eq!(metrics.total_tests, 2);

        let report = suite.report();
        assert!(report.contains("Benchmark: Full Mesh Tests"));
    }
}

use std::collections::HashMap;

/// A single sidechain route: the output of `source_id` is copied to
/// `target_bus` of `target_id`.
#[derive(Debug, Clone, PartialEq)]
pub struct SidechainRoute {
    pub source_id: String,
    pub target_id: String,
    pub target_bus: u32,
}

/// Routes audio between plugin instances for sidechain processing.
///
/// After all plugins have produced their primary output for a given buffer,
/// the router copies source outputs into the appropriate sidechain input
/// buses of target plugins. This happens entirely within the companion
/// process — no browser round-trip required.
pub struct SidechainRouter {
    /// All registered routes, keyed by target instance ID for fast lookup.
    routes: HashMap<String, Vec<SidechainRoute>>,
}

impl SidechainRouter {
    /// Create a new, empty router.
    pub fn new() -> Self {
        Self {
            routes: HashMap::new(),
        }
    }

    /// Register a sidechain route: source instance's output goes to
    /// `target_bus` of `target_id`.
    pub fn add_route(&mut self, source_id: &str, target_id: &str, target_bus: u32) {
        let route = SidechainRoute {
            source_id: source_id.to_string(),
            target_id: target_id.to_string(),
            target_bus,
        };
        self.routes
            .entry(target_id.to_string())
            .or_default()
            .push(route);
    }

    /// Remove a sidechain route between `source_id` and `target_id`.
    ///
    /// If there are multiple routes between the same source and target
    /// (on different buses), all of them are removed.
    pub fn remove_route(&mut self, source_id: &str, target_id: &str) {
        if let Some(routes) = self.routes.get_mut(target_id) {
            routes.retain(|r| r.source_id != source_id);
            if routes.is_empty() {
                self.routes.remove(target_id);
            }
        }
    }

    /// Get all routes for a target instance.
    pub fn get_routes(&self, target_id: &str) -> Vec<SidechainRoute> {
        self.routes.get(target_id).cloned().unwrap_or_default()
    }

    /// Given a map of instance outputs (instance_id -> interleaved f32 buffer),
    /// produce sidechain input buffers for each target.
    ///
    /// Returns a map of `target_id` -> `Vec` of buffers (one per bus, ordered
    /// by bus index). Each inner `Vec<f32>` is the copied output from the
    /// corresponding source.
    pub fn route(&self, outputs: &HashMap<String, Vec<f32>>) -> HashMap<String, Vec<Vec<f32>>> {
        let mut result: HashMap<String, Vec<Vec<f32>>> = HashMap::new();

        for (target_id, routes) in &self.routes {
            // Find the highest bus index so we can size the outer vec.
            let max_bus = routes.iter().map(|r| r.target_bus).max().unwrap_or(0);
            let mut buses: Vec<Vec<f32>> = vec![Vec::new(); (max_bus + 1) as usize];

            for route in routes {
                if let Some(source_output) = outputs.get(&route.source_id) {
                    buses[route.target_bus as usize] = source_output.clone();
                }
            }

            result.insert(target_id.clone(), buses);
        }

        result
    }

    /// Return the total number of registered routes.
    pub fn route_count(&self) -> usize {
        self.routes.values().map(|v| v.len()).sum()
    }
}

impl Default for SidechainRouter {
    fn default() -> Self {
        Self::new()
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn add_and_get_routes() {
        let mut router = SidechainRouter::new();
        router.add_route("kick", "compressor", 1);

        let routes = router.get_routes("compressor");
        assert_eq!(routes.len(), 1);
        assert_eq!(routes[0].source_id, "kick");
        assert_eq!(routes[0].target_id, "compressor");
        assert_eq!(routes[0].target_bus, 1);
    }

    #[test]
    fn get_routes_empty_for_unknown_target() {
        let router = SidechainRouter::new();
        assert!(router.get_routes("nonexistent").is_empty());
    }

    #[test]
    fn remove_route() {
        let mut router = SidechainRouter::new();
        router.add_route("kick", "compressor", 1);
        router.add_route("snare", "compressor", 2);
        assert_eq!(router.route_count(), 2);

        router.remove_route("kick", "compressor");

        let routes = router.get_routes("compressor");
        assert_eq!(routes.len(), 1);
        assert_eq!(routes[0].source_id, "snare");
    }

    #[test]
    fn remove_route_cleans_up_empty_entries() {
        let mut router = SidechainRouter::new();
        router.add_route("kick", "compressor", 1);
        router.remove_route("kick", "compressor");

        assert_eq!(router.route_count(), 0);
        assert!(router.get_routes("compressor").is_empty());
    }

    #[test]
    fn remove_nonexistent_route_is_noop() {
        let mut router = SidechainRouter::new();
        router.add_route("kick", "compressor", 1);
        router.remove_route("snare", "compressor"); // doesn't exist
        assert_eq!(router.route_count(), 1);
    }

    #[test]
    fn route_copies_source_output_to_target_input() {
        let mut router = SidechainRouter::new();
        router.add_route("kick", "compressor", 1);

        let mut outputs = HashMap::new();
        outputs.insert("kick".to_string(), vec![0.5, 0.6, 0.7, 0.8]);
        outputs.insert("compressor".to_string(), vec![0.1, 0.2, 0.3, 0.4]);

        let sidechain_inputs = router.route(&outputs);

        let comp_inputs = sidechain_inputs.get("compressor").unwrap();
        // Bus 0 should be empty (no route to bus 0).
        assert!(comp_inputs[0].is_empty());
        // Bus 1 should contain the kick output.
        assert_eq!(comp_inputs[1], vec![0.5, 0.6, 0.7, 0.8]);
    }

    #[test]
    fn route_with_missing_source_gives_empty_bus() {
        let mut router = SidechainRouter::new();
        router.add_route("missing_source", "compressor", 1);

        let outputs = HashMap::new(); // no outputs at all

        let sidechain_inputs = router.route(&outputs);
        let comp_inputs = sidechain_inputs.get("compressor").unwrap();
        assert!(comp_inputs[1].is_empty());
    }

    #[test]
    fn route_multiple_sources_to_different_buses() {
        let mut router = SidechainRouter::new();
        router.add_route("kick", "multi_comp", 1);
        router.add_route("vocals", "multi_comp", 2);

        let mut outputs = HashMap::new();
        outputs.insert("kick".to_string(), vec![1.0, 1.0]);
        outputs.insert("vocals".to_string(), vec![0.5, 0.5]);

        let sidechain_inputs = router.route(&outputs);
        let mc_inputs = sidechain_inputs.get("multi_comp").unwrap();

        assert_eq!(mc_inputs.len(), 3); // buses 0, 1, 2
        assert!(mc_inputs[0].is_empty());
        assert_eq!(mc_inputs[1], vec![1.0, 1.0]);
        assert_eq!(mc_inputs[2], vec![0.5, 0.5]);
    }

    #[test]
    fn route_returns_empty_map_when_no_routes() {
        let router = SidechainRouter::new();
        let outputs = HashMap::new();
        assert!(router.route(&outputs).is_empty());
    }
}

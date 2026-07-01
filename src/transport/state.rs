//! Connection state machine (SPEC_06 §5.3)
//!
//! Implements the 6-state connection state machine with distinct
//! inbound and outbound transition paths.

use super::TransportError;

/// Direction of connection establishment
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ConnectionDirection {
    /// We initiated the connection (outbound)
    Outbound,
    /// Peer initiated the connection (inbound)
    Inbound,
}

/// Connection state machine states
///
/// State transitions:
/// - Outbound: Connected → VersionSent → VerackSent → Established
/// - Inbound: Connected → VersionReceived → VerackSent → Established
/// - Any state can transition to Closed
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ConnectionState {
    /// TCP connected, no messages exchanged yet
    Connected,
    /// VERSION sent (outbound path only)
    VersionSent,
    /// VERSION received (inbound path only)
    VersionReceived,
    /// Both VERSIONs exchanged, VERACK sent
    VerackSent,
    /// Handshake complete, connection established
    Established,
    /// Connection closed
    Closed,
}

impl ConnectionState {
    /// Validate state transition for OUTBOUND connections
    ///
    /// Valid transitions:
    /// - Connected → VersionSent
    /// - VersionSent → VerackSent
    /// - VerackSent → Established
    /// - Any → Closed
    pub fn transition_outbound(
        self,
        to: ConnectionState,
    ) -> Result<ConnectionState, TransportError> {
        match (self, to) {
            (Self::Connected, Self::VersionSent) => Ok(to),
            (Self::VersionSent, Self::VerackSent) => Ok(to),
            (Self::VerackSent, Self::Established) => Ok(to),
            (_, Self::Closed) => Ok(to), // Always allow closing
            _ => Err(TransportError::InvalidStateTransition { from: self, to }),
        }
    }

    /// Validate state transition for INBOUND connections
    ///
    /// Valid transitions:
    /// - Connected → VersionReceived
    /// - VersionReceived → VerackSent
    /// - VerackSent → Established
    /// - Any → Closed
    pub fn transition_inbound(
        self,
        to: ConnectionState,
    ) -> Result<ConnectionState, TransportError> {
        match (self, to) {
            (Self::Connected, Self::VersionReceived) => Ok(to),
            (Self::VersionReceived, Self::VerackSent) => Ok(to),
            (Self::VerackSent, Self::Established) => Ok(to),
            (_, Self::Closed) => Ok(to), // Always allow closing
            _ => Err(TransportError::InvalidStateTransition { from: self, to }),
        }
    }

    /// Check if connection is established
    #[must_use]
    pub fn is_established(&self) -> bool {
        matches!(self, Self::Established)
    }

    /// Check if connection is closed
    #[must_use]
    pub fn is_closed(&self) -> bool {
        matches!(self, Self::Closed)
    }
}

impl std::fmt::Display for ConnectionState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Connected => write!(f, "Connected"),
            Self::VersionSent => write!(f, "VersionSent"),
            Self::VersionReceived => write!(f, "VersionReceived"),
            Self::VerackSent => write!(f, "VerackSent"),
            Self::Established => write!(f, "Established"),
            Self::Closed => write!(f, "Closed"),
        }
    }
}

impl std::fmt::Display for ConnectionDirection {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Outbound => write!(f, "Outbound"),
            Self::Inbound => write!(f, "Inbound"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_outbound_valid_transitions() {
        let mut state = ConnectionState::Connected;

        // Connected → VersionSent
        state = state
            .transition_outbound(ConnectionState::VersionSent)
            .unwrap();
        assert_eq!(state, ConnectionState::VersionSent);

        // VersionSent → VerackSent
        state = state
            .transition_outbound(ConnectionState::VerackSent)
            .unwrap();
        assert_eq!(state, ConnectionState::VerackSent);

        // VerackSent → Established
        state = state
            .transition_outbound(ConnectionState::Established)
            .unwrap();
        assert_eq!(state, ConnectionState::Established);
        assert!(state.is_established());
    }

    #[test]
    fn test_inbound_valid_transitions() {
        let mut state = ConnectionState::Connected;

        // Connected → VersionReceived
        state = state
            .transition_inbound(ConnectionState::VersionReceived)
            .unwrap();
        assert_eq!(state, ConnectionState::VersionReceived);

        // VersionReceived → VerackSent
        state = state
            .transition_inbound(ConnectionState::VerackSent)
            .unwrap();
        assert_eq!(state, ConnectionState::VerackSent);

        // VerackSent → Established
        state = state
            .transition_inbound(ConnectionState::Established)
            .unwrap();
        assert_eq!(state, ConnectionState::Established);
        assert!(state.is_established());
    }

    #[test]
    fn test_invalid_outbound_transition() {
        let state = ConnectionState::Connected;

        // Cannot skip directly to Established
        let result = state.transition_outbound(ConnectionState::Established);
        assert!(matches!(
            result,
            Err(TransportError::InvalidStateTransition { .. })
        ));

        // Cannot go to VersionReceived (inbound-only state)
        let result = state.transition_outbound(ConnectionState::VersionReceived);
        assert!(matches!(
            result,
            Err(TransportError::InvalidStateTransition { .. })
        ));
    }

    #[test]
    fn test_invalid_inbound_transition() {
        let state = ConnectionState::Connected;

        // Cannot skip directly to Established
        let result = state.transition_inbound(ConnectionState::Established);
        assert!(matches!(
            result,
            Err(TransportError::InvalidStateTransition { .. })
        ));

        // Cannot go to VersionSent (outbound-only state)
        let result = state.transition_inbound(ConnectionState::VersionSent);
        assert!(matches!(
            result,
            Err(TransportError::InvalidStateTransition { .. })
        ));
    }

    #[test]
    fn test_close_from_any_state() {
        // Should be able to close from any state (outbound)
        let states = [
            ConnectionState::Connected,
            ConnectionState::VersionSent,
            ConnectionState::VerackSent,
            ConnectionState::Established,
        ];

        for state in states {
            let result = state.transition_outbound(ConnectionState::Closed);
            assert!(result.is_ok());
            assert!(result.unwrap().is_closed());
        }

        // Should be able to close from any state (inbound)
        let states = [
            ConnectionState::Connected,
            ConnectionState::VersionReceived,
            ConnectionState::VerackSent,
            ConnectionState::Established,
        ];

        for state in states {
            let result = state.transition_inbound(ConnectionState::Closed);
            assert!(result.is_ok());
            assert!(result.unwrap().is_closed());
        }
    }

    #[test]
    fn test_state_display() {
        assert_eq!(ConnectionState::Connected.to_string(), "Connected");
        assert_eq!(ConnectionState::VersionSent.to_string(), "VersionSent");
        assert_eq!(
            ConnectionState::VersionReceived.to_string(),
            "VersionReceived"
        );
        assert_eq!(ConnectionState::VerackSent.to_string(), "VerackSent");
        assert_eq!(ConnectionState::Established.to_string(), "Established");
        assert_eq!(ConnectionState::Closed.to_string(), "Closed");
    }

    #[test]
    fn test_direction_display() {
        assert_eq!(ConnectionDirection::Outbound.to_string(), "Outbound");
        assert_eq!(ConnectionDirection::Inbound.to_string(), "Inbound");
    }
}

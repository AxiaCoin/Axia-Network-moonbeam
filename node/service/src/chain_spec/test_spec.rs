// Copyright 2019-2021 AxiaStake Inc.
// This file is part of Moonbeam.

// Moonbeam is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// Moonbeam is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with Moonbeam.  If not, see <http://www.gnu.org/licenses/>.

//! Embedded specs for testing purposes, must be compiled with --features=test-spec
use crate::chain_spec::moonbase::{testnet_genesis, ChainSpec};
use crate::chain_spec::{get_from_seed, Extensions};
use cumulus_primitives_core::ParaId;
use moonbase_runtime::{currency::UNIT, AccountId};
use nimbus_primitives::NimbusId;
use sc_service::ChainType;
use std::str::FromStr;

/// Generate testing chain_spec for staking integration tests with accounts initialized for
/// collating and nominating.
pub fn staking_spec(para_id: ParaId) -> ChainSpec {
	ChainSpec::from_genesis(
		"Moonbase Development Testnet",
		"staking",
		ChainType::Local,
		move || {
			testnet_genesis(
				// Root
				AccountId::from_str("6Be02d1d3665660d22FF9624b7BE0551ee1Ac91b").unwrap(),
				// Council members: Baltathar, Charleth and Dorothy
				vec![
					AccountId::from_str("3Cd0A705a2DC65e5b1E1205896BaA2be8A07c6e0").unwrap(),
					AccountId::from_str("798d4Ba9baf0064Ec19eB4F0a1a45785ae9D6DFc").unwrap(),
					AccountId::from_str("773539d4Ac0e786233D90A233654ccEE26a613D9").unwrap(),
				],
				// Council members: Alith and Baltathar
				vec![
					AccountId::from_str("6Be02d1d3665660d22FF9624b7BE0551ee1Ac91b").unwrap(),
					AccountId::from_str("3Cd0A705a2DC65e5b1E1205896BaA2be8A07c6e0").unwrap(),
				],
				// Collators
				vec![
					(
						AccountId::from_str("6Be02d1d3665660d22FF9624b7BE0551ee1Ac91b").unwrap(),
						get_from_seed::<NimbusId>("Alice"),
						1_000 * UNIT,
					),
					(
						AccountId::from_str("C0F0f4ab324C46e55D02D0033343B4Be8A55532d").unwrap(),
						get_from_seed::<NimbusId>("Faith"),
						1_000 * UNIT,
					),
				],
				// Delegations
				vec![],
				// Endowed accounts (each minted 1 << 80 balance)
				vec![
					AccountId::from_str("6Be02d1d3665660d22FF9624b7BE0551ee1Ac91b").unwrap(),
					AccountId::from_str("C0F0f4ab324C46e55D02D0033343B4Be8A55532d").unwrap(),
					AccountId::from_str("Ff64d3F6efE2317EE2807d223a0Bdc4c0c49dfDB").unwrap(),
					AccountId::from_str("f24FF3a9CF04c71Dbc94D0b566f7A27B94566cac").unwrap(),
				],
				3_000_000 * UNIT,
				para_id,
				// Chain ID
				1280,
			)
		},
		vec![],
		None,
		None,
		Some(serde_json::from_str("{\"tokenDecimals\": 18}").expect("Provided valid json map")),
		Extensions {
			relay_chain: "alphanet_local".into(),
			para_id: para_id.into(),
		},
	)
}

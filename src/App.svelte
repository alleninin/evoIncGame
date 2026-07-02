<script>
	import './app.css';
	import { onMount } from 'svelte';
	import * as d3 from 'd3';
	import * as topojson from 'topojson-client';
	import { apBioQuestions } from './questions.js';

	// ─── Game State (Svelte 5 runes) ───────────────────────────────────────────
	let gameState = $state({
		running: false,
		originSet: false,
		originCountry: null,
		selectedCountry: null,
		years: 0,
		strategy: null,
		dna: 10,
		mutationRate: 1.0,
		intelligence: 1,
		coldResistance: 0,
		heatResistance: 0,
		traits: [],
		directedMigrationReady: false,
		oceanSpread: false,
		speciesName: 'ALPHA-GENUS',
		peakTerritories: 0
	});

	// UI state
	let screen = $state('name'); // 'name' | 'strategy' | 'game'

	let showEvolution = $state(false);
	let showEndgame = $state(false);
	let showQuiz = $state(false);
	let endgameData = $state({ won: false, title: '', stats: '', msg: '' });

	let sidePanel = $state({
		title: 'Select a Region',
		climate: '-',
		temp: '-',
		pred: '-',
		status: '-'
	});

	let logEntries = $state([]);
	let eventBanner = $state({ visible: false, msg: '', color: '#ff4d4d' });
	let speciesInputVal = $state('');

	// Quiz state
	let currentQuestionIndex = $state(0);

	let answeredCurrent = $state(false);
	let quizQuestion = $state(null);
	let quizFeedback = $state({ msg: '', color: '' });
	let quizShowNext = $state(false);

	// Map internals (not reactive — managed by D3)
	let mapContainer;

	let svg, g, path, projection;
	let countriesData = null;
	const occupiedCountries = new Set();
	const landNeighbors = new Map();

	// ─── Constants ─────────────────────────────────────────────────────────────
	const climateColors = {
		Tropical: '#2d6a4f',
		Desert: '#e9c46a',
		Arid: '#d4a373',
		Temperate: '#74c69d',
		Tundra: '#a8dadc',
		Subarctic: '#457b9d',
		Mediterranean: '#f4a261',
		Highland: '#6d6875'
	};

	const problemCountries = {
		Egypt: 'Desert',
		Libya: 'Desert',
		Algeria: 'Desert',
		Mali: 'Desert',
		Chad: 'Desert',
		Sudan: 'Desert',
		Niger: 'Desert',
		Mauritania: 'Desert',
		'Saudi Arabia': 'Desert',
		Iraq: 'Desert',
		Iran: 'Arid',
		Australia: 'Arid',
		Peru: 'Arid',
		Kazakhstan: 'Arid'
	};

	const falseBorders = [
		['France', 'Brazil'],
		['France', 'Suriname'],
		['Denmark', 'Canada'],
		['Netherlands', 'Venezuela']
	];

	const strategyLabels = {
		type1: 'Type I (K-Selection)',
		type2: 'Type II',
		type3: 'Type III (r-Selection)'
	};

	const randomEvents = [
		{
			name: '❄️ Ice Age',
			color: '#88ccff',
			message: (lost) => `ICE AGE! ${lost} tundra/subarctic regions lost ☠️☠️☠️☠️☠️☠️. Cold Resistance helped.`,
			noop: () => 'ICE AGE began, but your Cold Resistance protected all territories!',
			filter: (c) => c === 'Tundra' || c === 'Subarctic',
			resist: () => gameState.coldResistance
		},

		{
			name: '🌋 Supervolcano',
			color: '#ff6622',
			message: (lost) => `SUPERVOLCANO! ${lost} desert/arid regions devastated ☠️☠️☠️☠️☠️☠️. Heat Resistance helped.`,
			noop: () => 'SUPERVOLCANO erupted, but your Heat Resistance shielded your desert populations!',
			filter: (c) => c === 'Desert' || c === 'Arid',
			resist: () => gameState.heatResistance
		},

		{
			name: '☀️ Mega Drought',
			color: '#e9c46a',
			message: (lost) => `MEGA DROUGHT! ${lost} regions desertified and lost ☠️☠️☠️☠️☠️. Heat Resistance helped.`,
			noop: () => 'MEGA DROUGHT struck, your Heat Resistance kept populations alive!',
			filter: (c) => c === 'Temperate' || c === 'Mediterranean',
			resist: () => gameState.heatResistance
		},

		{
			name: '🌊 Sea Level Rise',
			color: '#0077cc',
			message: (lost) => `SEA LEVEL RISE! ${lost} coastal regions flooded. ☠️☠️☠️☠️☠️☠️☠️`,
			noop: () => 'Sea levels rose, no occupied coastal regions affected this time.',
			filter: (c) => c === 'Tropical' || c === 'Mediterranean',
			resist: () => gameState.intelligence / 4
		}
	];

	// ─── Trait Trees ───────────────────────────────────────────────────────────
	const traitTrees = {
		type1: [
			{
				id: 'proto_brain',
				name: 'Proto-Brain',
				cost: 10,
				requires: [],
				effect: () => {
					gameState.intelligence += 1;
				},
				desc: 'Enlarged brain regions improve problem-solving and memory. K-selected species invest heavily in offspring brain development, a hallmark of the Type I survivorship curve, where few offspring are born but each has a high survival probability.'
			},

			{
				id: 'neuro',
				name: 'Neural Complexity',
				cost: 20,
				requires: ['proto_brain'],
				effect: () => {
					gameState.intelligence += 2;
					gameState.directedMigrationReady = true;
				},
				desc: 'Dense neural networks allow deliberate migration planning. Unlocks Directed Migration, a uniquely K-selected advantage. High-intelligence species (primates, elephants, orcas) can consciously select habitat, unlike r-selected organisms that scatter randomly.'
			},

			{
				id: 'culture',
				name: 'Cultural Transmission',
				cost: 35,
				requires: ['neuro'],
				effect: () => {
					gameState.intelligence += 3;
					gameState.dna += 10;
					gameState.directedMigrationReady = true;
				},
				desc: 'Learned behaviors are passed between generations without genetic change, a form of non-genetic inheritance. This is the apex of K-selection: survival knowledge accumulates across generations, dramatically reducing early mortality.'
			},

			{
				id: 'care',
				name: 'Parental Care',
				cost: 15,
				requires: [],
				effect: () => {
					gameState.coldResistance += 1;
				},
				desc: 'Parents invest energy protecting offspring through vulnerable early life stages. This is the defining feature of Type I survivorship curves; mortality is concentrated late in life rather than early.'
			},

			{
				id: 'fur',
				name: 'Thick Fur & Blubber',
				cost: 20,
				requires: ['care'],
				effect: () => {
					gameState.coldResistance += 1;
				},
				desc: 'Insulating coat and subcutaneous fat retain body heat. Allows colonization of Subarctic regions. Endothermy is energetically expensive — a K-selected trade-off of high energy use for reliable survival across temperature extremes.'
			},

			{
				id: 'antifreeze',
				name: 'Antifreeze Proteins',
				cost: 30,
				requires: ['fur'],
				effect: () => {
					gameState.coldResistance += 1;
					gameState.mutationRate += 0.3;
				},
				desc: 'Ice-binding proteins prevent cellular ice crystal formation — a specific molecular adaptation to tundra environments. Evolved independently in Arctic fish, insects, and plants (convergent evolution). Unlocks deep tundra territories.'
			},

			{
				id: 'tool_use',
				name: 'Primitive Tool Use',
				cost: 25,
				requires: ['proto_brain'],
				effect: () => {
					gameState.intelligence += 1;
					gameState.mutationRate += 0.4;
				},
				desc: 'Using objects to solve problems extends the effective ecological niche of a species. K-selected species like chimpanzees and crows use tools to exploit food sources unavailable to competitors.'
			},

			{
				id: 'cache',
				name: 'Food Caching',
				cost: 15,
				requires: [],
				effect: () => {
					gameState.dna += 0.005;
				},
				desc: 'Storing food resources buffers against seasonal scarcity. Species with reliable energy reserves can invest more in offspring quality (K-strategy) rather than producing large numbers of low-investment young.'
			}
		],
		type2: [
			{
				id: 'generalist',
				name: 'Generalist Diet',
				cost: 15,
				requires: [],
				effect: () => {
					gameState.mutationRate += 0.5;
				},
				desc: 'Consuming a wide variety of food types reduces dependence on any single resource. Type II survivorship species experience roughly constant mortality rates across their lifespan, making adaptability super valuable.'
			},

			{
				id: 'scavenger',
				name: 'Opportunistic Scavenging',
				cost: 20,
				requires: ['generalist'],
				effect: () => {
					gameState.mutationRate += 0.4;
					gameState.heatResistance += 1;
				},
				desc: 'Exploiting the kills of other predators provides energy at low risk. Scavengers like hyenas and vultures thrive in harsh, hot environments. Unlocks Desert/Arid territories.'
			},

			{
				id: 'aquatic_diet',
				name: 'Aquatic Foraging',
				cost: 25,
				requires: ['generalist'],
				effect: () => {
					gameState.mutationRate += 0.6;
					gameState.coldResistance += 1;
					gameState.oceanSpread = true;
				},
				desc: 'Exploiting rivers, lakes, and coastlines for food. Coastal foraging allows ocean island hopping, unlocking Ocean Spread. Cold water tolerance develops from immersion in cold seas.'
			},

			{
				id: 'homeo',
				name: 'Endothermic Homeostasis',
				cost: 25,
				requires: [],
				effect: () => {
					gameState.coldResistance += 1;
					gameState.heatResistance += 1;
				},
				desc: 'Maintaining a constant internal body temperature regardless of external conditions. This is a key reason mammals and birds achieve the relatively flat Type II survivorship curve.'
			},

			{
				id: 'sweat',
				name: 'Evaporative Cooling',
				cost: 20,
				requires: ['homeo'],
				effect: () => {
					gameState.heatResistance += 1;
				},
				desc: 'Sweat glands dissipate excess heat through water evaporation. Unlocks Desert and Arid regions. Humans are uniquely proficient sweaters among primates.'
			},

			{
				id: 'torpor',
				name: 'Seasonal Torpor',
				cost: 20,
				requires: ['homeo'],
				effect: () => {
					gameState.coldResistance += 1;
					gameState.dna += 5;
				},
				desc: 'Dramatically reducing metabolism during winter (hibernation) or heat (estivation) conserves energy when resources are scarce. It effectively compresses the survivorship curve.'
			},

			{
				id: 'social',
				name: 'Social Group Living',
				cost: 20,
				requires: [],
				effect: () => {
					gameState.intelligence += 1;
					gameState.mutationRate += 0.3;
				},
				desc: 'Forming stable social groups enables cooperative foraging, predator defense, and information sharing. Group living is strongly associated with Type II survivorship.'
			},

			{
				id: 'migration_instinct',
				name: 'Seasonal Migration',
				cost: 30,
				requires: ['social'],
				effect: () => {
					gameState.intelligence += 1;
					gameState.directedMigrationReady = true;
				},
				desc: 'Innate navigation allows coordinated movement to follow seasonal resources. Unlocks Directed Migration. Unlike random dispersal, migration is directed and predictable.'
			},

			{
				id: 'camouflage',
				name: 'Adaptive Camouflage',
				cost: 15,
				requires: [],
				effect: () => {
					gameState.mutationRate += 0.7;
				},
				desc: 'Cryptic coloration and pattern matching to local environments reduces predation risk, temporarily pushing its local survivorship curve toward Type I.'
			}
		],
		type3: [
			{
				id: 'spores',
				name: 'Mass Spawning',
				cost: 10,
				requires: [],
				effect: () => {
					gameState.mutationRate += 2.0;
				},
				desc: 'Producing vast numbers of offspring with minimal parental investment defines Type III survivorship: mortality is catastrophically high early in life, but sheer numbers ensure some individuals survive. Explosive spread rate.'
			},

			{
				id: 'airborne',
				name: 'Airborne Dispersal',
				cost: 20,
				requires: ['spores'],
				effect: () => {
					gameState.mutationRate += 1.5;
				},
				desc: 'Lightweight eggs, larvae, or seeds carried by wind currents can travel thousands of kilometers. Individual survival probability is near zero, but reach is global. Massively increases spread rate.'
			},

			{
				id: 'ocean_current',
				name: 'Ocean Current Dispersal',
				cost: 20,
				requires: ['spores'],
				effect: () => {
					gameState.mutationRate += 1.0;
					gameState.coldResistance += 1;
					gameState.oceanSpread = true;
				},
				desc: 'Buoyant eggs or larvae carried by ocean currents colonize distant coastlines and islands. Unlocks Ocean Spread across water barriers. Cold oceanic waters provide incidental cold resistance.'
			},

			{
				id: 'unstable',
				name: 'Hypermutation',
				cost: 15,
				requires: [],
				effect: () => {
					gameState.dna += 0.005;
				},
				desc: 'Elevated mutation rates generate enormous genetic variation each generation. Most mutations are harmful, but rare beneficial mutations spread rapidly through a large population. Increases passive DNA generation.'
			},

			{
				id: 'horizontal_gene',
				name: 'Horizontal Gene Transfer',
				cost: 25,
				requires: ['unstable'],
				effect: () => {
					gameState.heatResistance += 1;
					gameState.coldResistance += 1;
				},
				desc: 'Incorporating genetic material from other organisms. Common in bacteria, also observed in some invertebrates and plants. Allows extremely rapid acquisition of locally-adapted traits like heat shock proteins or antifreeze compounds.'
			},

			{
				id: 'metamorphosis',
				name: 'Radical Life Stage Shift',
				cost: 30,
				requires: ['unstable'],
				effect: () => {
					gameState.mutationRate += 1.0;
					gameState.heatResistance += 1;
				},
				desc: 'Complete metamorphosis allows larval and adult stages to exploit entirely different ecological niches. Insects using this strategy account for the majority of all animal species on Earth.'
			},

			{
				id: 'swarm_basic',
				name: 'Swarm Behavior',
				cost: 15,
				requires: [],
				effect: () => {
					gameState.intelligence += 1;
					gameState.mutationRate += 0.5;
				},
				desc: 'Simple collective behavior from individual organisms following local rules creates predator confusion, improves foraging, and accelerates colonization without requiring individual intelligence.'
			},

			{
				id: 'swarm_adv',
				name: 'Emergent Collective Intelligence',
				cost: 35,
				requires: ['swarm_basic'],
				effect: () => {
					gameState.intelligence += 2;
					gameState.directedMigrationReady = true;
				},
				desc: 'Complex colony-level problem solving (as seen in army ants, termites, and slime molds) allows the collective to navigate and colonize new territories strategically. Unlocks Directed Migration.'
			},

			{
				id: 'chitin_armor',
				name: 'Desiccation-Resistant Exoskeleton',
				cost: 20,
				requires: [],
				effect: () => {
					gameState.heatResistance += 1;
				},
				desc: 'A watertight chitinous exoskeleton prevents dehydration in dry, hot environments, the adaptation that allowed early arthropods to colonize land. Unlocks Desert/Arid biomes.'
			}
		]
	};

	// ─── Lifecycle ─────────────────────────────────────────────────────────────
	onMount(() => {
		const { width, height } = mapContainer.getBoundingClientRect();

		projection = d3.geoNaturalEarth1();
		path = d3.geoPath().projection(projection);
		svg = d3.select(mapContainer.querySelector('svg')).attr('width', width).attr('height', height);
		svg.append('rect').attr('width', width).attr('height', height).attr('class', 'ocean').on('click', deselectAll);
		g = svg.append('g');

		d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json').then((data) => {
			countriesData = topojson.feature(data, data.objects.countries);
			projection.fitSize([width, height], countriesData);

			const idToName = new Map();

			countriesData.features.forEach((f) => idToName.set(+f.id, f.properties.name));

			const neighbours = new Map();

			countriesData.features.forEach((f) => neighbours.set(+f.id, new Set()));

			topojson.mesh(data, data.objects.countries, (a, b) => {
				if (a !== b) {
					neighbours.get(+a.id)?.add(+b.id);
					neighbours.get(+b.id)?.add(+a.id);
				}

				return false;
			});

			neighbours.forEach((nbSet, id) => {
				const name = idToName.get(id);

				if (!name) return;
				if (!landNeighbors.has(name)) landNeighbors.set(name, new Set());

				nbSet.forEach((nbId) => {
					const nbName = idToName.get(nbId);

					if (nbName) landNeighbors.get(name).add(nbName);
				});
			});

			for (const [a, b] of falseBorders) {
				landNeighbors.get(a)?.delete(b);
				landNeighbors.get(b)?.delete(a);
			}

			g.selectAll('path').data(countriesData.features).enter().append('path').attr('class', 'country').attr('d', path).attr('fill', (d) => getCountryColor(d)).on('click', (event, d) => handleCountryClick(event, d));
		});

		window.addEventListener('resize', onResize);

		return () => window.removeEventListener('resize', onResize);
	});

	// ─── Map helpers ───────────────────────────────────────────────────────────
	function onResize() {
		if (!countriesData) return;

		const { width: w, height: h } = mapContainer.getBoundingClientRect();

		projection.fitSize([w, h], countriesData);
		svg.attr('width', w).attr('height', h);
		svg.select('rect').attr('width', w).attr('height', h);
		g.selectAll('.country').attr('d', path);
	}

	function getClimate(d) {
		const [, lat] = d3.geoCentroid(d);

		if (Math.abs(lat) > 60) return { climate: 'Tundra', temp: -5 };
		if (Math.abs(lat) < 20) return { climate: 'Tropical', temp: 28 };
		if (Math.abs(lat) < 35) return { climate: 'Subtropical', temp: 22 };

		return { climate: 'Temperate', temp: 15 };
	}

	function getCountryColor(d) {
		const climate = problemCountries[d.properties.name] || getClimate(d).climate;

		return climateColors[climate] || '#52b788';
	}

	function PredLevel(d) {
		if (!gameState.originCountry) return 'Unknown';

		const dist = d3.geoDistance(d3.geoCentroid(gameState.originCountry), d3.geoCentroid(d));

		if (dist === 0) return 'Low (Native)';
		if (dist < 0.7) return 'Low';
		if (dist < 1.5) return 'Medium';
		if (dist < 2.3) return 'High';

		return 'Extreme';
	}

	function updateVisuals() {
		if (!g) return;

		g.selectAll('.country').classed('occupied', (d) => occupiedCountries.has(d.properties.name)).classed('selected-highlight', (d) => gameState.selectedCountry === d.properties.name);
	}

	// ─── Game flow ─────────────────────────────────────────────────────────────
	function confirmName() {
		const name = speciesInputVal.trim();

		if (!name) return;

		gameState.speciesName = name;
		screen = 'strategy';
	}

	function startGame(choice) {
		gameState.strategy = choice;

		if (choice === 'type1') {
			gameState.intelligence = 4;
		}

		if (choice === 'type2') {
			gameState.mutationRate = 1.5;
			gameState.intelligence = 2.5;
		}

		if (choice === 'type3') {
			gameState.mutationRate = 2.5;
		}

		screen = 'game';
	}

	function handleCountryClick(event, d) {
		event.stopPropagation();

		const name = d.properties.name;

		if (gameState.strategy && !gameState.originSet) {
			setOrigin(d);

			return;
		}

		if (gameState.selectedCountry === name) {
			deselectAll();
		} else {
			gameState.selectedCountry = name;
			updateSidePanelData(d);
			updateVisuals();
		}
	}

	function setOrigin(d) {
		gameState.originCountry = d;
		gameState.originSet = true;
		gameState.running = true;
		occupyCountry(d.properties.name);
		gameState.selectedCountry = d.properties.name;
		updateSidePanelData(d);
		setInterval(updateGame, 50);
	}

	function deselectAll() {
		gameState.selectedCountry = null;

		sidePanel = {
			title: 'Select a Region',
			climate: '-',
			temp: '-',
			pred: '-',
			status: '-'
		};

		updateVisuals();
	}

	function updateSidePanelData(d) {
		const climate = getClimate(d);
		const predation = PredLevel(d);
		const isOccupied = occupiedCountries.has(d.properties.name);

		sidePanel = {
			title: d.properties.name,
			climate: problemCountries[d.properties.name] || climate.climate,
			temp: `${climate.temp}°C`,
			pred: predation,
			status: isOccupied ? 'Occupied' : 'Unoccupied'
		};
	}

	// ─── Game loop ─────────────────────────────────────────────────────────────
	function updateGame() {
		if (!gameState.running) return;

		gameState.years += 37;
		gameState.dna += gameState.strategy === 'type3' ? 0.015 : 0.01;

		if (Math.random() < 0.5) checkMigration();
		if (Math.random() < 0.001) triggerRandomEvent();

		checkWinLose();
	}

	function occupyCountry(name) {
		if (occupiedCountries.has(name)) return;

		occupiedCountries.add(name);

		if (occupiedCountries.size > (gameState.peakTerritories || 0)) {
			gameState.peakTerritories = occupiedCountries.size;
		}

		addLog(`Colonized ${name}`, 'var(--accent)');
		updateVisuals();
	}

	function checkMigration() {
		if (!countriesData || occupiedCountries.size === 0) return;

		const occupiedArr = Array.from(occupiedCountries);
		const sourceName = occupiedArr[Math.floor(Math.random() * occupiedArr.length)];
		let candidates = [];
		const neighbors = landNeighbors.get(sourceName);

		if (neighbors && neighbors.size > 0) {
			candidates = Array.from(neighbors).filter((n) => !occupiedCountries.has(n));
		}

		if (gameState.oceanSpread && Math.random() < 0.3) {
			const sourceFeature = countriesData.features.find((f) => f.properties.name === sourceName);

			if (sourceFeature) {
				const oceanCandidates = countriesData.features.filter((f) => {
					if (occupiedCountries.has(f.properties.name)) return false;

					const dist = d3.geoDistance(d3.geoCentroid(sourceFeature), d3.geoCentroid(f));

					return dist < 1.2;
				}).map((f) => f.properties.name);

				candidates = [...new Set([...candidates, ...oceanCandidates])];
			}
		}

		if (candidates.length === 0) return;

		const name = candidates[Math.floor(Math.random() * candidates.length)];
		const target = countriesData.features.find((f) => f.properties.name === name);

		if (!target) return;

		const climate = problemCountries[name] || getClimate(target).climate;

		if (climate === 'Tundra' || climate === 'Subarctic' && gameState.coldResistance < 1) return;
		if (climate === 'Desert' || climate === 'Arid' && gameState.heatResistance < 1) return;

		if (Math.random() < gameState.mutationRate * 0.02) {
			occupyCountry(name);
		}
	}

	function isReachable(targetName) {
		for (const src of occupiedCountries) {
			const nb = landNeighbors.get(src);

			if (nb && nb.has(targetName)) return true;
		}

		if (gameState.oceanSpread) {
			const targetFeat = countriesData.features.find((f) => f.properties.name === targetName);

			if (targetFeat) {
				for (const src of occupiedCountries) {
					const srcFeat = countriesData.features.find((f) => f.properties.name === src);

					if (srcFeat) {
						const dist = d3.geoDistance(d3.geoCentroid(srcFeat), d3.geoCentroid(targetFeat));

						if (dist < 1.2) return true;
					}
				}
			}
		}

		return false;
	}

	function directedMigrate() {
		const name = gameState.selectedCountry;

		if (!name || !gameState.directedMigrationReady) return;

		if (gameState.dna < 20) {
			showEventBanner('Not enough DNA points for Directed Migration.', '#ff9900');

			return;
		}

		const target = countriesData.features.find((f) => f.properties.name === name);

		if (!target) return;

		if (occupiedCountries.has(name)) {
			showEventBanner('Already occupied!', '#aaa');

			return;
		}

		const reachable = isReachable(name);

		if (!reachable && gameState.intelligence < 3) {
			showEventBanner('Ocean barrier! Need Ocean Spread trait or max Intelligence.', '#0077cc');

			return;
		}

		if (gameState.intelligence < 3) {
			const climate = problemCountries[name] || getClimate(target).climate;

			if (climate === 'Tundra' || climate === 'Subarctic' && gameState.coldResistance < 1) {
				showEventBanner('Too cold! Evolve Cold Resistance first.', '#88ccff');

				return;
			}

			if (climate === 'Desert' || climate === 'Arid' && gameState.heatResistance < 1) {
				showEventBanner('Too hot! Evolve Heat Resistance first.', '#ffaa44');

				return;
			}
		}

		gameState.dna -= 20;
		occupyCountry(name);
		showEventBanner(`Directed Migration: Your species settled ${name}!`, '#00ffcc');
	}

	// ─── Win/Lose ──────────────────────────────────────────────────────────────
	function checkWinLose() {
		if (!countriesData || !gameState.originSet) return;

		const total = countriesData.features.length;

		if (occupiedCountries.size === 0) endGame(false); else if (occupiedCountries.size >= total) endGame(true);
	}

	function endGame(won) {
		gameState.running = false;

		const name = gameState.speciesName || 'Your Species';

		if (won) {
			endgameData = {
				won: true,
				title: '🌍 GLOBAL DOMINATION',
				stats: `<strong>${name}</strong> has colonized every region on Earth.<br>Strategy: ${strategyLabels[gameState.strategy]} &nbsp;|&nbsp; Years elapsed: ${Math.floor(gameState.years).toLocaleString()} &nbsp;|&nbsp; Traits evolved: ${gameState.traits.length}`,
				msg: `Your species achieved what no organism has done before: complete global colonization.<br>With ${gameState.traits.length} evolutionary adaptation${gameState.traits.length !== 1 ? 's' : ''} and a ${strategyLabels[gameState.strategy]} strategy, <em>${name}</em> outcompeted every ecosystem on the planet.`
			};
		} else {
			endgameData = {
				won: false,
				title: '💀 EXTINCTION',
				stats: `<strong>${name}</strong> has gone extinct.<br>Strategy: ${strategyLabels[gameState.strategy]} &nbsp;|&nbsp; Years elapsed: ${Math.floor(gameState.years).toLocaleString()} &nbsp;|&nbsp; Peak territories: ${gameState.peakTerritories || 1}`,
				msg: `All populations of <em>${name}</em> have been wiped out by environmental events.<br><br>Over 99% of all species that have ever lived are now extinct. Species that invest too heavily in specialization are most vulnerable when conditions change. Consider evolving climate resistance traits earlier.`
			};
		}

		showEndgame = true;
	}

	// ─── Random events ─────────────────────────────────────────────────────────
	function triggerRandomEvent() {
		const evt = randomEvents[Math.floor(Math.random() * randomEvents.length)];
		const resist = evt.resist();
		let affected = [];

		for (const name of occupiedCountries) {
			const feat = countriesData.features.find((f) => f.properties.name === name);

			if (!feat) continue;

			const climate = problemCountries[name] || getClimate(feat).climate;

			if (evt.filter(climate)) affected.push(name);
		}

		if (affected.length === 0) {
			const msg = evt.noop();

			showEventBanner(msg, evt.color);
			addLog(`${evt.name}: ${msg}`, evt.color);

			return;
		}

		const survivalChance = Math.min(0.9, resist * 0.35);
		const lostNames = [];

		for (const name of affected) {
			if (Math.random() > survivalChance) {
				occupiedCountries.delete(name);
				lostNames.push(name);
			}
		}

		updateVisuals();

		if (lostNames.length === 0) {
			const msg = evt.noop();

			showEventBanner(msg, evt.color);
			addLog(`${evt.name}: ${msg}`, evt.color);
		} else {
			const summary = evt.message(lostNames.length);

			showEventBanner(summary, evt.color);
			addLog(`${evt.name}: Lost ${lostNames.join(', ')}`, evt.color);
		}
	}

	function showEventBanner(msg, color = '#ff4d4d') {
		eventBanner = { visible: true, msg, color };

		setTimeout(
			() => {
				eventBanner = { ...eventBanner, visible: false };
			},
			5000
		);
	}

	function addLog(msg, color) {
		logEntries = [
			{ msg: `Yr ${Math.floor(gameState.years)}: ${msg}`, color },
			...logEntries.slice(0, 49)
		];
	}

	// ─── Evolution tree ────────────────────────────────────────────────────────
	function openEvolve() {
		gameState.running = false;
		showEvolution = true;
	}

	function closeEvolve() {
		showEvolution = false;
		gameState.running = true;
	}

	function buyTrait(traitId, cost) {
		if (gameState.dna < cost) return;

		gameState.dna -= cost;
		gameState.traits = [...gameState.traits, traitId];

		const trait = traitTrees[gameState.strategy]?.find((t) => t.id === traitId);

		if (trait) trait.effect();

		// trigger reactivity
		gameState = { ...gameState };
	}

	let availableTraits = $derived(traitTrees[gameState.strategy] || []);

	// ─── Quiz ──────────────────────────────────────────────────────────────────
	function openQuiz() {
		showQuiz = true;

		if (!quizQuestion) loadQuestion(currentQuestionIndex);
	}

	function closeQuiz() {
		showQuiz = false;
	}

	function loadQuestion(index) {
		answeredCurrent = false;
		quizShowNext = false;
		quizFeedback = { msg: '', color: '' };

		if (index >= apBioQuestions.length) {
			index = 0;
			currentQuestionIndex = 0;
		}

		currentQuestionIndex = index;
		quizQuestion = apBioQuestions[index];
	}

	function checkQuizAnswer(selectedIndex) {
		if (answeredCurrent) return;

		answeredCurrent = true;

		const qData = apBioQuestions[currentQuestionIndex];

		if (selectedIndex === qData.answer) {
			quizFeedback = {
				msg: `CORRECT! +3 DNA harvested.\n\n${qData.explanation}`,
				color: 'var(--accent)'
			};

			gameState.dna += 3;
		} else {
			quizFeedback = {
				msg: `INCORRECT. Option [${qData.answer + 1}] was the correct variant.\n\n${qData.explanation}`,
				color: 'var(--danger)'
			};
		}

		quizShowNext = true;
	}

	function loadNextQuestion() {
		loadQuestion(Math.random() * apBioQuestions.length | 0);
	}
</script>

<!-- ─── Name Screen ─────────────────────────────────────────────────────────── -->

{#if screen === 'name'}
	<div class="overlay z-[1100]">
		<h1 class="mb-0 tracking-[6px]">EVOLUTION INC.</h1>
		<p class="mt-2 text-[#aaa]">A plague-inc-like survivorship curve simulation</p>

		<div class="ui-panel mt-[30px] px-[40px] py-[30px] text-center">
			<h3 class="mt-0 text-cyan-400">Name Your Species</h3>
			<p class="text-[0.9em] text-[#aaa]">What will future fossil hunters call you?</p>

			<input
				class="input-field"
				type="text"
				maxlength="24"
				placeholder="e.g. Homo Sapien"
				bind:value={speciesInputVal}
				onkeydown={(e) => e.key === 'Enter' && confirmName()}
			/>

			<button class="mt-[10px]" onclick={confirmName}>Confirm Name →</button>
		</div>
	</div>

	<!-- ─── Strategy Screen ────────────────────────────────────────────────────── -->
{:else if screen === 'strategy'}
	<div class="overlay z-[1000]">
		<h1 class="tracking-[5px]">CHOOSE YOUR SURVIVAL STRATEGY</h1>

		<p class="mt-1 mb-6 text-[1.1em] text-cyan-400">{gameState.speciesName}: Select your survivorship curve</p>

		<div class="mt-[10px] flex gap-5">
			{#each [
				{
					key: 'type1',
					label: 'Type I (K-Selection)',
					desc: 'Low mortality throughout life, most individuals survive to old age. Few, high-investment offspring. Ex: humans, elephants, large mammals.',
					starts: 'High Intelligence, unlocks brain-based traits first.'
				},

				{
					key: 'type2',
					label: 'Type II (Constant Mortality)',
					desc: 'Mortality rate is roughly equal at all life stages, lanced reproduction. Ex: birds, rodents, many reptiles.',
					starts: 'Balanced spread & intelligence, most adaptable tree.'
				},

				{
					key: 'type3',
					label: 'Type III (r-Selection)',
					desc: 'Catastrophically high early mortality, only a tiny fraction survive to reproduce. Vast numbers of offspring. Ex: fish, insects, most invertebrates.',
					starts: 'Rapid spread, quantity over quality.'
				}
			] as opt}
				<div class="ui-panel w-[260px] text-center">
					<h3 class="text-cyan-400">{opt.label}</h3>
					<p class="text-[0.85em] text-[#aaa]">{opt.desc}</p>
					<p class="mt-2 text-[0.8em]"><strong>Starts with:</strong>{opt.starts}</p>

					<button class="mt-3" onclick={() => startGame(opt.key)}>Choose {opt.label.split(' ')[0]} {opt.label.split(' ')[1]}</button>
				</div>
			{/each}
		</div>
	</div>
{/if}

<!-- ─── Game UI (always mounted so D3 can attach) ─────────────────────────── -->

<div id="top-bar" class="ui-panel flex h-[60px] w-full items-center justify-between border-b-2 border-cyan-400/80 px-10">
	<div class="text-[0.95rem] uppercase tracking-[2px] text-[#e0e0e0]">
		SPECIES:
		<span class="stat-value">{gameState.speciesName.toUpperCase()}</span>
	</div>

	<div class="text-[0.95rem] uppercase tracking-[2px] text-[#e0e0e0]">
		DNA:
		<span class="stat-value">{Math.floor(gameState.dna)}</span>
	</div>

	<div class="text-[0.95rem] uppercase tracking-[2px] text-[#e0e0e0]">
		YEAR:
		<span class="stat-value">{Math.floor(gameState.years)}</span>
	</div>

	<div class="text-[0.95rem] uppercase tracking-[2px] text-[#e0e0e0]">
		COLD:
		<span class="stat-value">{gameState.coldResistance}</span>
	</div>

	<div class="text-[0.95rem] uppercase tracking-[2px] text-[#e0e0e0]">
		HEAT:
		<span class="stat-value">{gameState.heatResistance}</span>
	</div>

	<div class="text-[0.95rem] uppercase tracking-[2px] text-[#e0e0e0]">
		INT:
		<span class="stat-value">{gameState.intelligence}</span>
	</div>
</div>

<div id="map-container" class="relative flex-1 overflow-hidden cursor-crosshair" bind:this={mapContainer}>
	<svg id="world-map"></svg>

	{#if screen === 'game' && !gameState.originSet}
		<div class="absolute left-1/2 top-5 z-[5] -translate-x-1/2 rounded-full bg-cyan-400 px-4 py-1 font-bold text-black">CLICK A REGION TO START YOUR SPECIES</div>
	{/if}
</div>

<div id="bottom-bar" class="flex h-[200px] w-full border-t-2 border-cyan-400/80 pb-[30px]">
	<div id="side-panel" class="ui-panel flex h-full flex-[3_1_0%] flex-wrap items-center justify-between gap-[15px] border-t-0">
		<h2 class="m-0 flex-[1_1_100%] text-cyan-400">{sidePanel.title}</h2>
		<p class="m-0 flex-[1_1_150px] text-[0.9em]">Climate: <span>{sidePanel.climate}</span></p>
		<p class="m-0 flex-[1_1_150px] text-[0.9em]">Temperature: <span>{sidePanel.temp}</span></p>
		<p class="m-0 flex-[1_1_150px] text-[0.9em]">Predation: <span>{sidePanel.pred}</span></p>
		<p class="m-0 flex-[1_1_150px] text-[0.9em]">Status: <span>{sidePanel.status}</span></p>
		<button class="w-full" onclick={openEvolve}>Open Evolution Tree</button>

		{#if gameState.directedMigrationReady}
			<button class="mt-[6px] w-full" onclick={directedMigrate}>🧠 Directed Migration (20 DNA)</button>
		{/if}
	</div>

	<div id="log-container" class="flex-1 overflow-y-auto border-l border-white/10 bg-black/30 p-[10px] text-[0.8em]">
		<strong class="text-cyan-400">EVENT LOG</strong>

		{#each logEntries as entry}
			<div
				class="log-entry mb-[5px] border-l-2 pl-[5px] text-[#bbb]"
				style="border-color:{entry.color}"
			>{entry.msg}</div>
		{/each}
	</div>
</div>

{#if screen === 'game' && gameState.running}
	<button id="summon-quiz-btn" class="fixed bottom-[250px] right-5 z-[1400] shadow-[0_0_10px_rgba(0,255,204,0.3)]" onclick={openQuiz}>Study Bio (Earn DNA)</button>
{/if}

<!-- ─── Event Banner ───────────────────────────────────────────────────────── -->

{#if eventBanner.visible}
	<div
		id="event-banner"
		class="fixed inset-x-0 top-[80px] z-[999] mx-auto w-max rounded-full px-6 py-2 text-[1.1em] font-bold text-black"
		style="background:{eventBanner.color}"
	>{eventBanner.msg}</div>
{/if}

<!-- ─── Quiz Popup ─────────────────────────────────────────────────────────── -->

{#if showQuiz}
	<div id="quiz-popup" class="fixed bottom-[250px] right-5 z-[1500] flex max-h-[400px] w-[340px] flex-col rounded border-2 border-cyan-400/80 bg-[rgba(15,22,33,0.95)] shadow-[0_0_15px_rgba(0,255,204,0.2)]">
		<div class="flex items-center justify-between border-b border-cyan-400/30 bg-cyan-400/10 px-[15px] py-[10px]">
			<strong class="tracking-[1px] text-cyan-400">AP BIO WORKSTATION</strong>

			<button
				class="px-[8px] py-[2px] text-[0.8em] text-[#aaa]"
				onclick={closeQuiz}
			>X</button>
		</div>

		<div class="overflow-y-auto p-[15px] text-[0.85em] leading-[1.4]">
			{#if quizQuestion}
				<div class="mb-3 font-semibold text-white">{currentQuestionIndex + 1}. {quizQuestion.question}</div>

				<div>
					{#each quizQuestion.options as optText, i}
						<button
							class="quiz-option-btn mb-[6px] block w-full border border-white/10 bg-white/5 px-[12px] py-[8px] text-left text-[0.9em] text-[#e0e0e0] transition hover:border-cyan-400 hover:bg-cyan-400/10 hover:text-white"
							onclick={() => checkQuizAnswer(i)}
							disabled={answeredCurrent}
						>{optText}</button>
					{/each}
				</div>

				{#if quizFeedback.msg}
					<div
						class="mt-[10px] whitespace-pre-line text-[0.9em] font-bold"
						style="color:{quizFeedback.color}"
					>{quizFeedback.msg}</div>
				{/if}

				{#if quizShowNext}
					<button class="mt-[12px] w-full px-[6px] py-[6px] text-[0.85em]" onclick={loadNextQuestion}>Next Problem →</button>
				{/if}
			{:else}
				<p>Loading question...</p>
			{/if}
		</div>
	</div>
{/if}

<!-- ─── Evolution Overlay ──────────────────────────────────────────────────── -->

{#if showEvolution}
	<div id="evolution-overlay">
		<h1>EVOLUTION TREE</h1>

		<div id="trait-container">
			{#each availableTraits as trait}
				{@const isPurchased = gameState.traits.includes(trait.id)}
				{@const prereqsMet = (trait.requires || []).every((r) => gameState.traits.includes(r))}
				{@const canAfford = gameState.dna >= trait.cost}
				{@const isLocked = !prereqsMet}
				{@const prereqNames = (trait.requires || []).map((r) => availableTraits.find((x) => x.id === r)?.name ?? r)}

				<div
					class="trait-card"
					style="opacity:{isLocked ? 0.4 : 1};border-color:{isPurchased ? 'gray' : isLocked ? '#555' : 'var(--accent)'}"
				>
					<h3 style="margin:0 0 6px;font-size:0.95em">{trait.name}</h3>

					<p
						style="font-size:0.72em;color:#aaa;line-height:1.4;margin-bottom:8px"
					>{trait.desc}</p>

					{#if isLocked}
						<p style="color:#ff9900;font-size:0.75em">🔒 Requires: {prereqNames.join(', ')}</p>
					{/if}

					<p style="margin:4px 0"><strong>Cost: {trait.cost} DNA</strong></p>

					<button
						onclick={() => buyTrait(trait.id, trait.cost)}
						disabled={isPurchased || !canAfford || isLocked}
					>{isPurchased ? '✓ Evolved' : isLocked ? '🔒 Locked' : 'Evolve'}</button>
				</div>
			{/each}
		</div>

		<button onclick={closeEvolve} style="margin-top:30px">Back to Map</button>
	</div>
{/if}

<!-- ─── Endgame Overlay ────────────────────────────────────────────────────── -->

{#if showEndgame}
	<div id="endgame-overlay">
		<h1
			style="color:{endgameData.won ? 'var(--accent)' : 'var(--danger)'}"
		>{endgameData.title}</h1>

		<div class="stats">{@html endgameData.stats}</div>
		<p>{@html endgameData.msg}</p>

		<button
			onclick={() => location.reload()}
			style="margin-top:30px;font-size:1em"
		>↺ Play Again</button>
	</div>
{/if}

<style>
	:global(:root) {
		--panel-bg: rgba(20, 25, 35, 0.9);
		--accent: #00ffcc;
		--danger: #ff4d4d;
		--selected: #fffb00;
		--text: #e0e0e0;
	}

	:global(body) {
		margin: 0;
		background-color: #0a0e14;
		color: var(--text);
		font-family: "Garamond", "Georgia", "Playfair Display", serif;
		overflow: hidden;
		height: 100vh;
		display: flex;
		flex-direction: column;
	}

	:global(h1) {
		font-size: 56px;
		letter-spacing: -1.68px;
		margin: 32px 0;
		color: #f5f5f5;
	}

	:global(h2) {
		font-size: 24px;
		line-height: 118%;
		letter-spacing: -0.24px;
		margin: 0 0 8px;
		color: #f5f5f5;
	}

	:global(p) {
		margin: 0;
	}

	:global(button) {
		background: transparent;
		border: 1px solid rgba(0, 255, 204, 0.8);
		color: #00ffcc;
		padding: 10px 20px;
		cursor: pointer;
		text-transform: uppercase;
		letter-spacing: 1px;
		transition: 0.3s;
	}

	:global(button:hover) {
		background: #00ffcc;
		color: #000;
	}

	:global(button:disabled) {
		border-color: #444;
		color: #444;
		cursor: not-allowed;
	}

	:global(button:disabled:hover) {
		background: transparent;
	}

	.overlay {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		background: rgba(0, 0, 0, 0.97);
	}

	.ui-panel {
		background: var(--panel-bg);
		backdrop-filter: blur(10px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		padding: 20px;
		pointer-events: all;
		box-sizing: border-box;
	}

	.input-field {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(0, 255, 204, 0.8);
		color: #00ffcc;
		padding: 10px 18px;
		font-size: 1.2em;
		text-align: center;
		letter-spacing: 2px;
		width: 280px;
		margin: 20px 0 10px;
		outline: none;
	}

	:global(#app) {
		display: flex;
		flex-direction: column;
		height: 100vh;
		overflow: hidden;
	}

	#top-bar {
		height: 60px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0 40px;
		border-bottom: 2px solid var(--accent);
		width: 100%;
		box-sizing: border-box;
	}

	:global(.stat-value) {
		color: var(--accent);
		font-weight: bold;
		font-size: 1.2em;
	}

	#map-container {
		flex: 1;
		overflow: hidden;
		cursor: crosshair;
		position: relative;
		min-height: 0;
	}

	#map-container svg {
		width: 100%;
		height: 100%;
		display: block;
	}

	#bottom-bar {
		display: flex;
		height: 200px;
		border-top: 2px solid var(--accent);
		padding-bottom: 30px;
		width: 100%;
		box-sizing: border-box;
	}

	#side-panel {
		flex: 3;
		height: 100%;
		border-top: none;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 15px;
	}

	#side-panel h2 {
		flex: 1 1 100%;
		margin: 0;
	}

	#side-panel p {
		margin: 0;
		flex: 1 1 150px;
		font-size: 0.9em;
	}

	#log-container {
		flex: 1;
		background: rgba(0, 0, 0, 0.3);
		border-left: 1px solid rgba(255, 255, 255, 0.1);
		padding: 10px;
		font-size: 0.8em;
		overflow-y: auto;
		min-width: 0;
	}

	:global(.log-entry) {
		border-left: 2px solid var(--accent);
		padding-left: 5px;
		margin-bottom: 5px;
		color: #bbb;
	}

	:global(.country) {
		stroke: rgba(255, 255, 255, 0.1);
		stroke-width: 0.5px;
		cursor: pointer;
		transition: fill 0.3s ease, stroke 0.3s;
	}

	:global(.country:hover) {
		stroke: var(--accent);
		stroke-width: 1.5px;
	}

	:global(.country.occupied) {
		fill: var(--danger) !important;
	}

	:global(.country.selected-highlight) {
		stroke: var(--selected) !important;
		stroke-width: 2.5px !important;
	}

	:global(.ocean) {
		fill: #011f2e;
		cursor: default;
	}

	#summon-quiz-btn {
		position: fixed;
		bottom: 250px;
		right: 20px;
		z-index: 1400;
		box-shadow: 0 0 10px rgba(0, 255, 204, 0.3);
	}

	#quiz-popup {
		position: fixed;
		bottom: 250px;
		right: 20px;
		width: 340px;
		max-height: 400px;
		background: rgba(15, 22, 33, 0.95);
		border: 2px solid var(--accent);
		box-shadow: 0 0 15px rgba(0, 255, 204, 0.2);
		z-index: 1500;
		display: flex;
		flex-direction: column;
		border-radius: 4px;
	}

	.quiz-header {
		background: rgba(0, 255, 204, 0.1);
		padding: 10px 15px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		border-bottom: 1px solid rgba(0, 255, 204, 0.3);
	}

	.quiz-body {
		padding: 15px;
		overflow-y: auto;
		font-size: 0.85em;
		line-height: 1.4;
	}

	:global(.quiz-option-btn) {
		display: block;
		width: 100%;
		text-align: left;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: var(--text);
		padding: 8px 12px;
		margin: 6px 0;
		font-size: 0.9em;
		cursor: pointer;
		text-transform: none;
		letter-spacing: 0;
		transition: 0.2s;
	}

	:global(.quiz-option-btn:hover) {
		background: rgba(0, 255, 204, 0.1);
		border-color: var(--accent);
		color: #fff;
	}

	#evolution-overlay {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(10, 14, 20, 0.95);
		z-index: 2000;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
	}

	#trait-container {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		max-height: 70vh;
		overflow-y: auto;
	}

	:global(.trait-card) {
		background: #1a1f29;
		border: 1px solid var(--accent);
		padding: 15px;
		width: 260px;
		text-align: center;
		margin: 10px;
		transition: 0.3s;
		vertical-align: top;
	}

	#endgame-overlay {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(10, 14, 20, 0.97);
		z-index: 3000;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
	}

	#endgame-overlay h1 {
		font-size: 3em;
		letter-spacing: 6px;
		margin-bottom: 10px;
	}

	#endgame-overlay p {
		font-size: 1.1em;
		color: #aaa;
		max-width: 500px;
		line-height: 1.7;
	}

	.stats {
		margin: 20px 0;
		font-size: 1em;
		color: var(--accent);
	}

	#event-banner {
		position: fixed;
		top: 80px;
		left: 50%;
		transform: translateX(-50%);
		color: #000;
		padding: 8px 24px;
		border-radius: 20px;
		font-weight: bold;
		z-index: 999;
		font-size: 1.1em;
	}
</style>

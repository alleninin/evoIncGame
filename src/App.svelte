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
		peakTerritories: 0,
		regions: 0
	});

	// UI state
	let screen = $state('name'); // 'name' | 'strategy' | 'game'

	let showEvolution = $state(false);
	let showEndgame = $state(false);
	let showQuiz = $state(false);
	let endgameData = $state({ won: false, title: '', lines: [] });

	let sidePanel = $state({
		title: null,
		climate: '-',
		temp: '-',
		pred: '-',
		occupied: false
	});

	let logEntries = $state([]);
	let eventBanner = $state({ visible: false, title: '', msg: '', tone: 'info' });
	let bannerTimer;
	let speciesInputVal = $state('');
	let selectedTraitId = $state(null);

	// Quiz state
	let currentQuestionIndex = $state(0);

	let answeredCurrent = $state(false);
	let selectedAnswer = $state(null);
	let quizQuestion = $state(null);
	let quizFeedback = $state({ correct: null, msg: '' });
	let quizShowNext = $state(false);

	// Map internals (not reactive — managed by D3)
	let mapContainer;
	let svgEl;

	let svg, g, path, projection, earthImage;
	let countriesData = null;
	const occupiedCountries = new Set();
	const landNeighbors = new Map();

	// ─── Constants ─────────────────────────────────────────────────────────────
	// NASA Blue Marble (public domain), equirectangular, served from jsDelivr.
	const EARTH_IMAGE_URL = 'https://cdn.jsdelivr.net/npm/three-globe@2.31.0/example/img/earth-blue-marble.jpg';
	const LAT_TOP = 84;
	const LAT_BOTTOM = -72;

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
		type1: 'Type I (K-selected)',
		type2: 'Type II',
		type3: 'Type III (r-selected)'
	};

	const strategies = [
		{
			key: 'type1',
			name: 'Type I',
			sub: 'K-selected',
			curve: 'M4,8 C70,8 110,10 128,26 S150,80 156,84',
			desc: 'Most individuals live to old age. Parents have a few young and put a lot into each one, like humans and elephants.',
			starts: 'Starts with high intelligence. Brain traits come first.'
		},
		{
			key: 'type2',
			name: 'Type II',
			sub: 'Constant mortality',
			curve: 'M4,8 L156,84',
			desc: 'An individual is about as likely to die at one age as any other. Songbirds and many rodents follow this curve.',
			starts: 'Balanced spread and intelligence, with the widest trait tree.'
		},
		{
			key: 'type3',
			name: 'Type III',
			sub: 'r-selected',
			curve: 'M4,8 C10,62 22,78 56,81 L156,84',
			desc: 'Almost every offspring dies young, so parents produce enormous numbers of them. Fish and most insects work this way.',
			starts: 'Starts with fast spread and low intelligence.'
		}
	];

	const randomEvents = [
		{
			name: 'Ice age',
			tone: 'info',
			message: (lost) => `Lost ${lost} cold region${lost === 1 ? '' : 's'} to the ice.`,
			noop: () => 'No regions lost.',
			filter: (c) => c === 'Tundra' || c === 'Subarctic',
			resist: () => gameState.coldResistance
		},

		{
			name: 'Supervolcano',
			tone: 'danger',
			message: (lost) => `Ash buried ${lost} desert region${lost === 1 ? '' : 's'}.`,
			noop: () => 'No regions lost.',
			filter: (c) => c === 'Desert' || c === 'Arid',
			resist: () => gameState.heatResistance
		},

		{
			name: 'Megadrought',
			tone: 'warn',
			message: (lost) => `${lost} temperate region${lost === 1 ? '' : 's'} dried out.`,
			noop: () => 'No regions lost.',
			filter: (c) => c === 'Temperate' || c === 'Mediterranean',
			resist: () => gameState.heatResistance
		},

		{
			name: 'Sea level rise',
			tone: 'info',
			message: (lost) => `Flooding wiped out ${lost} coastal region${lost === 1 ? '' : 's'}.`,
			noop: () => 'No regions lost.',
			filter: (c) => c === 'Tropical' || c === 'Mediterranean',
			resist: () => gameState.intelligence / 4
		}
	];

	// ─── Trait Trees ───────────────────────────────────────────────────────────
	// `fx` lists exactly what a trait changes: numbers are added, booleans are set.
	const traitTrees = {
		type1: [
			{
				id: 'proto_brain',
				name: 'Proto-Brain',
				cost: 10,
				requires: [],
				fx: { intelligence: 1 },
				desc: 'Larger brain regions improve memory and problem-solving. K-selected species make this kind of investment in each of their few offspring.'
			},

			{
				id: 'neuro',
				name: 'Neural Complexity',
				cost: 20,
				requires: ['proto_brain'],
				fx: { intelligence: 2, directedMigrationReady: true },
				desc: 'Denser wiring lets your species plan where to go next. Primates and orcas pick their habitat. r-selected species scatter at random.'
			},

			{
				id: 'culture',
				name: 'Cultural Transmission',
				cost: 35,
				requires: ['neuro'],
				fx: { intelligence: 3, dna: 10, directedMigrationReady: true },
				desc: 'Parents teach their young what they learned, with no change to DNA. Survival knowledge piles up over generations and fewer young die early.'
			},

			{
				id: 'care',
				name: 'Parental Care',
				cost: 15,
				requires: [],
				fx: { coldResistance: 1 },
				desc: 'Parents guard their young through the riskiest early years. That is what gives a Type I curve its shape: most deaths come late in life.'
			},

			{
				id: 'fur',
				name: 'Thick Fur & Blubber',
				cost: 20,
				requires: ['care'],
				fx: { coldResistance: 1 },
				desc: 'Insulation holds in body heat and opens up subarctic regions. Staying warm burns a lot of energy, a cost K-selected species pay for reliable survival.'
			},

			{
				id: 'antifreeze',
				name: 'Antifreeze Proteins',
				cost: 30,
				requires: ['fur'],
				fx: { coldResistance: 1, mutationRate: 0.3 },
				desc: 'Proteins that bind to ice crystals stop cells from freezing solid. Arctic fish and insects evolved them separately, a textbook case of convergent evolution.'
			},

			{
				id: 'tool_use',
				name: 'Primitive Tool Use',
				cost: 25,
				requires: ['proto_brain'],
				fx: { intelligence: 1, mutationRate: 0.4 },
				desc: 'Using objects to get food widens the niche. Chimpanzees and crows reach food their competitors can’t.'
			},

			{
				id: 'cache',
				name: 'Food Caching',
				cost: 15,
				requires: [],
				fx: { dna: 0.005 },
				desc: 'Stored food carries your species through lean seasons. With reliable energy, parents can invest more in each offspring.'
			}
		],
		type2: [
			{
				id: 'generalist',
				name: 'Generalist Diet',
				cost: 15,
				requires: [],
				fx: { mutationRate: 0.5 },
				desc: 'Eating many kinds of food means no single shortage can starve your species. On a Type II curve death can come at any age, so flexibility pays.'
			},

			{
				id: 'scavenger',
				name: 'Scavenging',
				cost: 20,
				requires: ['generalist'],
				fx: { mutationRate: 0.4, heatResistance: 1 },
				desc: 'Eating what other predators kill is cheap, low-risk energy. Hyenas and vultures thrive in hot, dry country. Opens desert and arid regions.'
			},

			{
				id: 'aquatic_diet',
				name: 'Aquatic Foraging',
				cost: 25,
				requires: ['generalist'],
				fx: { mutationRate: 0.6, coldResistance: 1, oceanSpread: true },
				desc: 'Your species learns to feed along coasts and rivers. Coastal populations can hop between islands, so you can now spread across the ocean.'
			},

			{
				id: 'homeo',
				name: 'Homeostasis',
				cost: 25,
				requires: [],
				fx: { coldResistance: 1, heatResistance: 1 },
				desc: 'Your species holds a steady body temperature whatever the weather. It’s a big reason mammals and birds have a flat Type II curve.'
			},

			{
				id: 'sweat',
				name: 'Evaporative Cooling',
				cost: 20,
				requires: ['homeo'],
				fx: { heatResistance: 1 },
				desc: 'Sweat carries heat away as it evaporates. Opens desert and arid regions. Humans out-sweat every other primate.'
			},

			{
				id: 'torpor',
				name: 'Seasonal Torpor',
				cost: 20,
				requires: ['homeo'],
				fx: { coldResistance: 1, dna: 5 },
				desc: 'Metabolism drops sharply through winter or drought, saving energy when food runs out. Hibernation is the best-known version.'
			},

			{
				id: 'social',
				name: 'Social Groups',
				cost: 20,
				requires: [],
				fx: { intelligence: 1, mutationRate: 0.3 },
				desc: 'Stable groups forage together and keep watch for predators. Group living goes hand in hand with a Type II curve.'
			},

			{
				id: 'migration_instinct',
				name: 'Seasonal Migration',
				cost: 30,
				requires: ['social'],
				fx: { intelligence: 1, directedMigrationReady: true },
				desc: 'Built-in navigation lets groups follow food as the seasons turn. Movement is planned, not random.'
			},

			{
				id: 'camouflage',
				name: 'Camouflage',
				cost: 15,
				requires: [],
				fx: { mutationRate: 0.7 },
				desc: 'Coloring that matches the surroundings makes your species harder to find. Locally, that pushes survivorship toward Type I.'
			}
		],
		type3: [
			{
				id: 'spores',
				name: 'Mass Spawning',
				cost: 10,
				requires: [],
				fx: { mutationRate: 2.0 },
				desc: 'Each parent releases huge numbers of young and leaves them to fend for themselves. Nearly all die early, but enough survive to keep spreading.'
			},

			{
				id: 'airborne',
				name: 'Airborne Dispersal',
				cost: 20,
				requires: ['spores'],
				fx: { mutationRate: 1.5 },
				desc: 'Light eggs and seeds ride the wind for thousands of kilometers. Few survive the trip, but the reach is global.'
			},

			{
				id: 'ocean_current',
				name: 'Ocean Drift',
				cost: 20,
				requires: ['spores'],
				fx: { mutationRate: 1.0, coldResistance: 1, oceanSpread: true },
				desc: 'Floating larvae drift on ocean currents to distant coasts, so you can now spread across the ocean. Cold seawater toughens them up.'
			},

			{
				id: 'unstable',
				name: 'Hypermutation',
				cost: 15,
				requires: [],
				fx: { dna: 0.005 },
				desc: 'A high mutation rate throws up lots of variation every generation. Most mutations hurt. The rare useful one spreads fast through a big population.'
			},

			{
				id: 'horizontal_gene',
				name: 'Gene Swapping',
				cost: 25,
				requires: ['unstable'],
				fx: { heatResistance: 1, coldResistance: 1 },
				desc: 'Your species picks up genes straight from other organisms, the way bacteria do. Ready-made adaptations like heat-shock proteins arrive in one step.'
			},

			{
				id: 'metamorphosis',
				name: 'Metamorphosis',
				cost: 30,
				requires: ['unstable'],
				fx: { mutationRate: 1.0, heatResistance: 1 },
				desc: 'Larvae and adults live completely different lives and never compete for food. Most animal species on Earth are insects that do this.'
			},

			{
				id: 'swarm_basic',
				name: 'Swarming',
				cost: 15,
				requires: [],
				fx: { intelligence: 1, mutationRate: 0.5 },
				desc: 'Each individual follows a few simple rules and the group moves as one. Swarms confuse predators and find food faster.'
			},

			{
				id: 'swarm_adv',
				name: 'Colony Intelligence',
				cost: 35,
				requires: ['swarm_basic'],
				fx: { intelligence: 2, directedMigrationReady: true },
				desc: 'Army ants and slime molds solve problems as a colony that no single individual could. The colony can now choose where to go.'
			},

			{
				id: 'chitin_armor',
				name: 'Exoskeleton',
				cost: 20,
				requires: [],
				fx: { heatResistance: 1 },
				desc: 'A waterproof shell keeps the body from drying out. It’s how early arthropods made it onto land. Opens desert and arid regions.'
			}
		]
	};

	const fxLabels = {
		intelligence: 'Intelligence',
		mutationRate: 'Spread rate',
		coldResistance: 'Cold resistance',
		heatResistance: 'Heat resistance',
		dna: 'DNA',
		directedMigrationReady: 'Directed migration',
		oceanSpread: 'Ocean spread'
	};

	// ─── Lifecycle ─────────────────────────────────────────────────────────────
	onMount(() => {
		projection = d3.geoEquirectangular();
		path = d3.geoPath().projection(projection);
		svg = d3.select(svgEl).on('click', deselectAll);

		earthImage = svg
			.append('image')
			.attr('href', EARTH_IMAGE_URL)
			.attr('preserveAspectRatio', 'none')
			.attr('class', 'earth')
			.on('load', () => earthImage.classed('loaded', true))
			.on('error', () => svg.classed('no-imagery', true));

		g = svg.append('g');

		d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json').then((data) => {
			countriesData = topojson.feature(data, data.objects.countries);

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

			g.selectAll('path').data(countriesData.features).enter().append('path').attr('class', 'country').on('click', (event, d) => handleCountryClick(event, d));

			layoutMap();
			updateVisuals();
		});

		// Size from the container itself. Measuring once on mount gave 0×0
		// before styles applied, which left the map blank until a resize.
		const ro = new ResizeObserver(layoutMap);

		ro.observe(mapContainer);
		layoutMap();

		return () => ro.disconnect();
	});

	// ─── Map helpers ───────────────────────────────────────────────────────────
	function layoutMap() {
		if (!svg || !mapContainer) return;

		const { width: w, height: h } = mapContainer.getBoundingClientRect();

		if (!w || !h) return;

		const latSpan = (LAT_TOP - LAT_BOTTOM) * Math.PI / 180;
		const scale = Math.min(w / (2 * Math.PI), h / latSpan);

		projection.scale(scale).center([0, (LAT_TOP + LAT_BOTTOM) / 2]).translate([w / 2, h / 2]);
		svg.attr('width', w).attr('height', h);

		const [x0, y0] = projection([-180, 90]);
		const [x1, y1] = projection([180, -90]);

		earthImage.attr('x', x0).attr('y', y0).attr('width', x1 - x0).attr('height', y1 - y0);

		if (countriesData) g.selectAll('.country').attr('d', path);
	}

	function getClimate(d) {
		const [, lat] = d3.geoCentroid(d);

		if (Math.abs(lat) > 60) return { climate: 'Tundra', temp: -5 };
		if (Math.abs(lat) < 20) return { climate: 'Tropical', temp: 28 };
		if (Math.abs(lat) < 35) return { climate: 'Subtropical', temp: 22 };

		return { climate: 'Temperate', temp: 15 };
	}

	function PredLevel(d) {
		if (!gameState.originCountry) return 'Unknown';

		const dist = d3.geoDistance(d3.geoCentroid(gameState.originCountry), d3.geoCentroid(d));

		if (dist === 0) return 'Low (native)';
		if (dist < 0.7) return 'Low';
		if (dist < 1.5) return 'Medium';
		if (dist < 2.3) return 'High';

		return 'Extreme';
	}

	function updateVisuals() {
		gameState.regions = occupiedCountries.size;

		if (!g) return;

		g.selectAll('.country').classed('occupied', (d) => occupiedCountries.has(d.properties.name)).classed('selected-highlight', (d) => gameState.selectedCountry === d.properties.name);
		g.selectAll('.selected-highlight').raise();
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
		updateVisuals();
		setInterval(updateGame, 50);
	}

	function deselectAll() {
		gameState.selectedCountry = null;

		sidePanel = {
			title: null,
			climate: '-',
			temp: '-',
			pred: '-',
			occupied: false
		};

		updateVisuals();
	}

	function updateSidePanelData(d) {
		const climate = getClimate(d);
		const predation = PredLevel(d);

		sidePanel = {
			title: d.properties.name,
			climate: problemCountries[d.properties.name] || climate.climate,
			temp: `${climate.temp} °C`,
			pred: predation,
			occupied: occupiedCountries.has(d.properties.name)
		};
	}

	function refreshSidePanel() {
		if (!gameState.selectedCountry || !countriesData) return;

		const feat = countriesData.features.find((f) => f.properties.name === gameState.selectedCountry);

		if (feat) updateSidePanelData(feat);
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

		addLog(`Spread to ${name}`, 'spread');
		updateVisuals();

		if (name === gameState.selectedCountry) refreshSidePanel();
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
			showEventBanner('Not enough DNA. Migrating costs 20.', 'warn');

			return;
		}

		const target = countriesData.features.find((f) => f.properties.name === name);

		if (!target) return;

		if (occupiedCountries.has(name)) {
			showEventBanner('You already live there.', 'warn');

			return;
		}

		const reachable = isReachable(name);

		if (!reachable && gameState.intelligence < 3) {
			showEventBanner('Too far across open water. Evolve ocean spread or reach intelligence 3.', 'info');

			return;
		}

		if (gameState.intelligence < 3) {
			const climate = problemCountries[name] || getClimate(target).climate;

			if (climate === 'Tundra' || climate === 'Subarctic' && gameState.coldResistance < 1) {
				showEventBanner('Too cold. Evolve cold resistance first.', 'info');

				return;
			}

			if (climate === 'Desert' || climate === 'Arid' && gameState.heatResistance < 1) {
				showEventBanner('Too hot. Evolve heat resistance first.', 'warn');

				return;
			}
		}

		gameState.dna -= 20;
		occupyCountry(name);
		showEventBanner(`Your species settled ${name}.`, 'good', 'Migration');
	}

	// ─── Win/Lose ──────────────────────────────────────────────────────────────
	function checkWinLose() {
		if (!countriesData || !gameState.originSet) return;

		const total = countriesData.features.length;

		if (occupiedCountries.size === 0) endGame(false); else if (occupiedCountries.size >= total) endGame(true);
	}

	function endGame(won) {
		gameState.running = false;

		const name = gameState.speciesName || 'Your species';
		const traitCount = gameState.traits.length;

		endgameData = {
			won,
			title: won ? 'Worldwide' : 'Extinct',
			lead: won ? `${name} lives in every region on Earth.` : `The last population of ${name} is gone.`,
			body: won
				? `It took ${traitCount} adaptation${traitCount === 1 ? '' : 's'} and a ${strategyLabels[gameState.strategy]} strategy.`
				: 'More than 99% of all species that ever lived are extinct. Climate resistance, evolved early, would have bought more time.',
			stats: [
				['Strategy', strategyLabels[gameState.strategy]],
				['Years', Math.floor(gameState.years).toLocaleString()],
				won ? ['Traits', String(traitCount)] : ['Peak regions', String(gameState.peakTerritories || 1)]
			]
		};

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

			showEventBanner(msg, evt.tone, evt.name);
			addLog(`${evt.name}. ${msg}`, 'event');

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
		refreshSidePanel();

		if (lostNames.length === 0) {
			const msg = evt.noop();

			showEventBanner(msg, evt.tone, evt.name);
			addLog(`${evt.name}. ${msg}`, 'event');
		} else {
			showEventBanner(evt.message(lostNames.length), evt.tone, evt.name);
			addLog(`${evt.name}. Lost ${lostNames.join(', ')}.`, 'event');
		}
	}

	function showEventBanner(msg, tone = 'danger', title = '') {
		eventBanner = { visible: true, title, msg, tone };
		clearTimeout(bannerTimer);

		bannerTimer = setTimeout(
			() => {
				eventBanner = { ...eventBanner, visible: false };
			},
			5000
		);
	}

	function addLog(msg, kind) {
		logEntries = [{ year: Math.floor(gameState.years), msg, kind }, ...logEntries.slice(0, 49)];
	}

	// ─── Evolution tree ────────────────────────────────────────────────────────
	let availableTraits = $derived(traitTrees[gameState.strategy] || []);
	let rootTraits = $derived(availableTraits.filter((t) => t.requires.length === 0));
	let selectedTrait = $derived(availableTraits.find((t) => t.id === selectedTraitId) || null);

	function childrenOf(id) {
		return availableTraits.filter((t) => t.requires[0] === id);
	}

	function traitName(id) {
		return availableTraits.find((t) => t.id === id)?.name ?? id;
	}

	function traitStatus(t) {
		if (gameState.traits.includes(t.id)) return 'owned';
		if (!t.requires.every((r) => gameState.traits.includes(r))) return 'locked';
		if (gameState.dna < t.cost) return 'expensive';

		return 'available';
	}

	function fxRows(t) {
		return Object.entries(t.fx).map(([k, v]) => [fxLabels[k], typeof v === 'boolean' ? 'Unlocked' : `+${v}`]);
	}

	function openEvolve() {
		gameState.running = false;

		if (!selectedTrait) {
			selectedTraitId = (availableTraits.find((t) => traitStatus(t) === 'available') || availableTraits[0])?.id ?? null;
		}

		showEvolution = true;
	}

	function closeEvolve() {
		showEvolution = false;
		gameState.running = true;
	}

	function buyTrait(traitId, cost) {
		if (gameState.dna < cost) return;

		const trait = availableTraits.find((t) => t.id === traitId);

		if (!trait || traitStatus(trait) !== 'available') return;

		gameState.dna -= cost;
		gameState.traits = [...gameState.traits, traitId];

		for (const [key, value] of Object.entries(trait.fx)) {
			if (typeof value === 'boolean') gameState[key] = value; else gameState[key] += value;
		}
	}

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
		selectedAnswer = null;
		quizShowNext = false;
		quizFeedback = { correct: null, msg: '' };

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
		selectedAnswer = selectedIndex;

		const qData = apBioQuestions[currentQuestionIndex];

		if (selectedIndex === qData.answer) {
			quizFeedback = { correct: true, msg: qData.explanation };
			gameState.dna += 3;
		} else {
			quizFeedback = { correct: false, msg: qData.explanation };
		}

		quizShowNext = true;
	}

	function loadNextQuestion() {
		loadQuestion(Math.random() * apBioQuestions.length | 0);
	}

	const letters = ['A', 'B', 'C', 'D', 'E'];
</script>

<!-- ─── Name Screen ─────────────────────────────────────────────────────────── -->

{#if screen === 'name'}
	<div class="hero z-[1100]" style="--earth:url({EARTH_IMAGE_URL})">
		<div class="hero-inner">
			<h1 class="display hero-title">Evolution<br />Inc.</h1>

			<label class="hero-label" for="species-name">Name your species</label>

			<div class="hero-row">
				<input
					id="species-name"
					class="hero-input"
					type="text"
					maxlength="24"
					placeholder="Homo sapiens"
					bind:value={speciesInputVal}
					onkeydown={(e) => e.key === 'Enter' && confirmName()}
				/>

				<button class="btn accent" onclick={confirmName} disabled={!speciesInputVal.trim()}>Start</button>
			</div>
		</div>
	</div>

	<!-- ─── Strategy Screen ────────────────────────────────────────────────────── -->
{:else if screen === 'strategy'}
	<div class="strategy z-[1000]">
		<div class="strategy-inner">
			<p class="strategy-kicker"><em>{gameState.speciesName}</em></p>
			<h1 class="display strategy-title">Pick a survivorship curve</h1>

			<div class="strategy-grid">
				{#each strategies as opt}
					<button class="strategy-card" onclick={() => startGame(opt.key)}>
						<svg class="curve" viewBox="0 0 172 102" preserveAspectRatio="xMinYMid meet" aria-hidden="true">
							<text transform="translate(7,46) rotate(-90)" text-anchor="middle">survivors</text>
							<text x="170" y="100" text-anchor="end">age</text>
							<g transform="translate(12,0)">
								<line x1="4" y1="4" x2="4" y2="88" />
								<line x1="4" y1="88" x2="158" y2="88" />
								<path d={opt.curve} />
							</g>
						</svg>

						<span class="display strategy-name">{opt.name}</span>
						<span class="strategy-sub">{opt.sub}</span>
						<span class="strategy-desc">{opt.desc}</span>
						<span class="strategy-starts">{opt.starts}</span>
						<span class="strategy-cta">Play {opt.name} →</span>
					</button>
				{/each}
			</div>
		</div>
	</div>
{/if}

<!-- ─── Game UI (always mounted so D3 can attach) ─────────────────────────── -->

<header class="topbar">
	<div class="display wordmark">Evolution Inc.</div>

	<div class="species">
		<em>{gameState.speciesName}</em>

		{#if gameState.strategy}
			<span class="tag">{strategies.find((s) => s.key === gameState.strategy)?.name}</span>
		{/if}
	</div>

	<dl class="stats num">
		<div class="stat dna"><dt>DNA</dt><dd>{Math.floor(gameState.dna)}</dd></div>
		<div class="stat"><dt>Year</dt><dd>{Math.floor(gameState.years).toLocaleString()}</dd></div>
		<div class="stat"><dt>Regions</dt><dd>{gameState.regions}</dd></div>
		<div class="stat"><dt>Cold</dt><dd>{gameState.coldResistance}</dd></div>
		<div class="stat"><dt>Heat</dt><dd>{gameState.heatResistance}</dd></div>
		<div class="stat"><dt>Int</dt><dd>{gameState.intelligence}</dd></div>
	</dl>
</header>

<div id="map-container" bind:this={mapContainer}>
	<svg id="world-map" bind:this={svgEl}></svg>

	{#if screen === 'game' && !gameState.originSet}
		<div class="toast start-hint">Click a country to choose where your species starts.</div>
	{/if}

	{#if eventBanner.visible}
		<div class="toast event tone-{eventBanner.tone}" role="status">
			{#if eventBanner.title}<b>{eventBanner.title}</b>{/if}
			<span>{eventBanner.msg}</span>
		</div>
	{/if}

	{#if screen === 'game' && gameState.running && !showQuiz}
		<button class="btn accent quiz-btn" onclick={openQuiz}>Bio quiz +3 DNA</button>
	{/if}

	<!-- ─── Quiz Popup ───────────────────────────────────────────────────────── -->

	{#if showQuiz}
		<div class="quiz" role="dialog" aria-label="Bio quiz">
			<div class="quiz-head">
				<span class="quiz-title">Bio quiz</span>
				<button class="link-btn" onclick={closeQuiz}>Close</button>
			</div>

			<div class="quiz-body">
				{#if quizQuestion}
					<p class="quiz-q">{quizQuestion.question}</p>

					<div class="quiz-options">
						{#each quizQuestion.options as optText, i}
							<button
								class="quiz-option"
								class:correct={answeredCurrent && i === quizQuestion.answer}
								class:wrong={answeredCurrent && i === selectedAnswer && i !== quizQuestion.answer}
								onclick={() => checkQuizAnswer(i)}
								disabled={answeredCurrent}
							>
								<span class="letter">{letters[i]}</span>
								<span>{optText}</span>
							</button>
						{/each}
					</div>

					{#if quizFeedback.correct !== null}
						<div class="quiz-feedback" class:correct={quizFeedback.correct}>
							<strong>{quizFeedback.correct ? 'Correct. +3 DNA.' : `Not quite. The answer is ${letters[quizQuestion.answer]}.`}</strong>
							<p>{quizFeedback.msg}</p>
						</div>
					{/if}

					{#if quizShowNext}
						<button class="btn quiz-next" onclick={loadNextQuestion}>Next question</button>
					{/if}
				{:else}
					<p>Loading question…</p>
				{/if}
			</div>
		</div>
	{/if}
</div>

<section class="bottom">
	<div class="region">
		{#if sidePanel.title}
			<div class="region-head">
				<h2 class="display region-name">{sidePanel.title}</h2>

				{#if sidePanel.occupied}<span class="pill">Occupied</span>{/if}
			</div>

			<dl class="facts num">
				<div><dt>Climate</dt><dd>{sidePanel.climate}</dd></div>
				<div><dt>Temp</dt><dd>{sidePanel.temp}</dd></div>
				<div><dt>Predation</dt><dd>{sidePanel.pred}</dd></div>
			</dl>
		{:else}
			<h2 class="display region-name muted">No region selected</h2>
			<p class="region-hint">Click a country on the map to see its climate and predation.</p>
		{/if}

		<div class="actions">
			<button class="btn" onclick={openEvolve} disabled={!gameState.strategy}>Evolve</button>

			{#if gameState.directedMigrationReady}
				<button class="btn secondary" onclick={directedMigrate} disabled={!gameState.selectedCountry}>Migrate here · 20 DNA</button>
			{/if}
		</div>
	</div>

	<aside class="log">
		<h3 class="eyebrow">Log</h3>

		{#if logEntries.length === 0}
			<p class="log-empty">Nothing yet.</p>
		{/if}

		<ol class="num">
			{#each logEntries as entry}
				<li class:event={entry.kind === 'event'}>
					<span class="log-year">{entry.year.toLocaleString()}</span>
					<span>{entry.msg}</span>
				</li>
			{/each}
		</ol>
	</aside>
</section>

<!-- ─── Evolution Overlay ──────────────────────────────────────────────────── -->

{#snippet branch(trait)}
	{@const kids = childrenOf(trait.id)}
	{@const status = traitStatus(trait)}

	<div class="t-row">
		<button class="t-node {status}" class:selected={selectedTraitId === trait.id} onclick={() => (selectedTraitId = trait.id)}>
			<span>{trait.name}</span>
			<span class="t-cost">{status === 'owned' ? '✓' : trait.cost}</span>
		</button>

		{#if kids.length}
			<div class="t-kids">
				{#each kids as kid}
					<div class="t-kid">{@render branch(kid)}</div>
				{/each}
			</div>
		{/if}
	</div>
{/snippet}

{#if showEvolution}
	<div class="evolve">
		<div class="evolve-main">
			<div class="evolve-head">
				<h1 class="display evolve-title">Evolve</h1>
				<div class="evolve-dna num">DNA <b>{Math.floor(gameState.dna)}</b></div>
			</div>

			<div class="t-roots">
				{#each rootTraits as root}
					{@render branch(root)}
				{/each}
			</div>

			<div class="evolve-foot">
				<button class="btn secondary" onclick={closeEvolve}>Back to map</button>
			</div>
		</div>

		<aside class="evolve-detail">
			{#if selectedTrait}
				{@const status = traitStatus(selectedTrait)}

				<h2 class="display detail-name">{selectedTrait.name}</h2>

				<div class="eyebrow detail-meta">
					{selectedTrait.cost} DNA{#if selectedTrait.requires.length} · after {selectedTrait.requires.map(traitName).join(', ')}{/if}
				</div>

				<p class="detail-desc">{selectedTrait.desc}</p>

				<ul class="effects num">
					{#each fxRows(selectedTrait) as [label, value]}
						<li><span>{label}</span><b>{value}</b></li>
					{/each}
				</ul>

				<button class="btn accent detail-buy" onclick={() => buyTrait(selectedTrait.id, selectedTrait.cost)} disabled={status !== 'available'}>
					{#if status === 'owned'}
						Evolved
					{:else if status === 'locked'}
						Needs {selectedTrait.requires.map(traitName).join(', ')} first
					{:else if status === 'expensive'}
						Need {Math.ceil(selectedTrait.cost - gameState.dna)} more DNA
					{:else}
						Evolve for {selectedTrait.cost} DNA
					{/if}
				</button>
			{:else}
				<p class="detail-desc">Pick a trait to see what it does.</p>
			{/if}
		</aside>
	</div>
{/if}

<!-- ─── Endgame Overlay ────────────────────────────────────────────────────── -->

{#if showEndgame}
	<div class="hero endgame" style="--earth:url({EARTH_IMAGE_URL})">
		<div class="hero-inner">
			<h1 class="display hero-title" class:lost={!endgameData.won}>{endgameData.title}</h1>
			<p class="end-lead">{endgameData.lead}</p>
			<p class="end-body">{endgameData.body}</p>

			<dl class="end-stats num">
				{#each endgameData.stats as [label, value]}
					<div><dt>{label}</dt><dd>{value}</dd></div>
				{/each}
			</dl>

			<button class="btn accent" onclick={() => location.reload()}>Play again</button>
		</div>
	</div>
{/if}

<style>
	:global(body) {
		overflow: hidden;
		height: 100vh;
		display: flex;
		flex-direction: column;
	}

	:global(#app) {
		display: flex;
		flex-direction: column;
		height: 100vh;
		overflow: hidden;
	}

	:global(.num) {
		font-variant-numeric: tabular-nums;
	}

	:global(.display) {
		font-stretch: 125%;
		font-weight: 900;
		letter-spacing: -0.01em;
		text-transform: uppercase;
		line-height: 0.92;
		margin: 0;
	}

	:global(.eyebrow) {
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--muted);
	}

	/* ── Buttons ── */
	:global(.btn) {
		font: 600 13px var(--font);
		border-radius: 3px;
		padding: 9px 16px;
		cursor: pointer;
		border: 1.5px solid var(--ink);
		background: var(--ink);
		color: var(--paper);
		transition: background 0.15s, color 0.15s, border-color 0.15s;
		white-space: nowrap;
	}

	:global(.btn:hover:not(:disabled)) {
		background: #2d2a25;
	}

	:global(.btn.secondary) {
		background: transparent;
		color: var(--ink);
	}

	:global(.btn.secondary:hover:not(:disabled)) {
		background: var(--ink);
		color: var(--paper);
	}

	:global(.btn.accent) {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
	}

	:global(.btn.accent:hover:not(:disabled)) {
		background: var(--accent-dark);
		border-color: var(--accent-dark);
	}

	:global(.btn:disabled) {
		background: transparent;
		color: var(--faint);
		border-color: var(--rule);
		cursor: not-allowed;
	}

	:global(.btn:focus-visible),
	.t-node:focus-visible,
	.strategy-card:focus-visible,
	.quiz-option:focus-visible {
		outline: 3px solid var(--accent);
		outline-offset: 2px;
	}

	.link-btn {
		background: none;
		border: 0;
		font: 600 12px var(--font);
		color: var(--muted);
		cursor: pointer;
		padding: 4px;
	}

	.link-btn:hover {
		color: var(--ink);
	}

	/* ── Title + endgame ── */
	.hero {
		position: fixed;
		inset: 0;
		overflow: hidden;
		background: var(--ocean);
		color: #fff;
	}

	/* Zoomed-in crop of the satellite image (Africa, Europe, Middle East). */
	.hero::before {
		content: '';
		position: absolute;
		inset: 0;
		background: var(--earth) 50% 50% / cover no-repeat;
		transform: scale(1.7);
		transform-origin: 62% 34%;
	}

	.hero::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(90deg, rgba(4, 10, 22, 0.9) 0%, rgba(4, 10, 22, 0.6) 45%, rgba(4, 10, 22, 0.1) 80%);
	}

	.hero-inner {
		z-index: 1;
	}

	.hero-inner {
		position: absolute;
		left: clamp(24px, 6vw, 88px);
		bottom: clamp(32px, 9vh, 96px);
		right: 24px;
	}

	.hero-title {
		font-size: clamp(56px, 11vw, 148px);
		margin-bottom: 32px;
	}

	.hero-title.lost {
		color: #ff8a65;
	}

	.hero-label {
		display: block;
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: rgba(255, 255, 255, 0.7);
		margin-bottom: 8px;
	}

	.hero-row {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}

	.hero-input {
		font: italic 500 17px var(--font);
		border: 0;
		background: var(--paper);
		border-radius: 3px;
		padding: 10px 14px;
		width: min(320px, 100%);
		color: var(--ink);
		outline: none;
	}

	.hero-input:focus {
		box-shadow: 0 0 0 3px var(--accent);
	}

	.hero .btn:disabled {
		color: rgba(255, 255, 255, 0.45);
		border-color: rgba(255, 255, 255, 0.25);
	}

	.endgame {
		z-index: 3000;
	}

	.end-lead {
		font-size: 22px;
		font-weight: 600;
		margin: 0 0 6px;
		max-width: 560px;
	}

	.end-body {
		color: rgba(255, 255, 255, 0.75);
		max-width: 520px;
		margin: 0 0 24px;
		font-size: 15px;
	}

	.end-stats {
		display: flex;
		gap: 36px;
		margin: 0 0 28px;
	}

	.end-stats dt {
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: rgba(255, 255, 255, 0.6);
	}

	.end-stats dd {
		margin: 2px 0 0;
		font-size: 18px;
		font-weight: 700;
	}

	/* ── Strategy ── */
	.strategy {
		position: fixed;
		inset: 0;
		background: var(--paper);
		overflow-y: auto;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 40px 24px;
	}

	.strategy-inner {
		width: 100%;
		max-width: 1080px;
	}

	.strategy-kicker {
		font-size: 18px;
		font-weight: 500;
		color: var(--muted);
		margin: 0 0 10px;
	}

	.strategy-title {
		font-size: clamp(36px, 5vw, 64px);
		margin-bottom: 36px;
	}

	.strategy-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: 16px;
	}

	.strategy-card {
		display: flex;
		flex-direction: column;
		text-align: left;
		background: var(--surface);
		border: 1.5px solid var(--ink);
		border-radius: 4px;
		padding: 20px;
		cursor: pointer;
		color: var(--ink);
		font: inherit;
		transition: transform 0.15s, box-shadow 0.15s;
	}

	.strategy-card:hover {
		transform: translateY(-2px);
		box-shadow: 4px 4px 0 var(--ink);
	}

	.curve {
		width: 100%;
		height: 96px;
		margin-bottom: 16px;
		overflow: visible;
	}

	.curve line {
		stroke: var(--faint);
		stroke-width: 1;
	}

	.curve path {
		fill: none;
		stroke: var(--accent);
		stroke-width: 3;
		stroke-linecap: round;
	}

	.curve text {
		font: 600 8px var(--font);
		fill: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.strategy-name {
		font-size: 30px;
	}

	.strategy-sub {
		font-size: 12px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--muted);
		margin: 6px 0 12px;
	}

	.strategy-desc {
		font-size: 14px;
		line-height: 1.5;
		margin-bottom: 10px;
	}

	.strategy-starts {
		font-size: 13px;
		color: var(--muted);
		margin-bottom: 18px;
	}

	.strategy-cta {
		margin-top: auto;
		font-weight: 700;
		font-size: 13px;
		color: var(--accent-dark);
	}

	/* ── Top bar ── */
	.topbar {
		display: flex;
		align-items: center;
		gap: 24px;
		padding: 12px 24px;
		background: var(--paper);
		flex-shrink: 0;
	}

	.wordmark {
		font-size: 22px;
		white-space: nowrap;
	}

	.species {
		font-size: 17px;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
	}

	.tag {
		font-size: 11px;
		font-weight: 700;
		background: var(--ink);
		color: var(--paper);
		border-radius: 2px;
		padding: 2px 6px;
		margin-left: 6px;
		vertical-align: 2px;
		text-transform: uppercase;
	}

	.stats {
		margin: 0 0 0 auto;
		display: flex;
		gap: 22px;
		align-items: baseline;
	}

	.stat {
		display: flex;
		align-items: baseline;
		gap: 6px;
	}

	.stat dt {
		font-size: 11px;
		font-weight: 700;
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.stat dd {
		margin: 0;
		font-size: 20px;
		font-weight: 800;
		font-stretch: 112%;
	}

	.stat.dna dd {
		color: var(--accent);
	}

	/* ── Map ── */
	#map-container {
		position: relative;
		flex: 1;
		min-height: 0;
		overflow: hidden;
		background: var(--ocean);
		cursor: crosshair;
	}

	#map-container svg {
		width: 100%;
		height: 100%;
		display: block;
	}

	:global(.earth) {
		opacity: 0;
		transition: opacity 0.6s ease;
	}

	:global(.earth.loaded) {
		opacity: 1;
	}

	:global(.country) {
		fill: transparent;
		stroke: rgba(255, 255, 255, 0.28);
		stroke-width: 0.5px;
		cursor: pointer;
		transition: fill 0.3s ease, stroke 0.2s;
	}

	/* If the satellite image can't load, fall back to flat land so the map is still playable. */
	:global(.no-imagery .country) {
		fill: #3c4a37;
	}

	:global(.country:hover) {
		stroke: #fff;
		stroke-width: 1.2px;
	}

	:global(.country.occupied) {
		fill: rgba(228, 87, 46, 0.6);
		stroke: #ffb59c;
		stroke-width: 0.8px;
	}

	:global(.country.selected-highlight) {
		stroke: #fff;
		stroke-width: 2px;
	}

	.toast {
		position: absolute;
		top: 16px;
		left: 16px;
		max-width: calc(100% - 32px);
		background: var(--paper);
		color: var(--ink);
		border-radius: 3px;
		padding: 8px 12px;
		font-size: 13px;
		display: flex;
		gap: 10px;
		align-items: baseline;
		box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
		z-index: 5;
		pointer-events: none;
	}

	.toast.start-hint {
		font-weight: 600;
	}

	.toast.event {
		border-left: 4px solid currentColor;
	}

	.toast b {
		font-weight: 800;
		font-stretch: 112%;
		text-transform: uppercase;
		font-size: 12px;
		white-space: nowrap;
	}

	.toast span {
		color: var(--ink);
	}

	.tone-info { color: var(--info); }
	.tone-danger { color: var(--danger); }
	.tone-warn { color: var(--warn); }
	.tone-good { color: var(--good); }

	.quiz-btn {
		position: absolute;
		right: 16px;
		bottom: 16px;
		z-index: 5;
	}

	/* ── Quiz ── */
	.quiz {
		position: absolute;
		right: 16px;
		bottom: 16px;
		width: 380px;
		max-width: calc(100% - 32px);
		max-height: calc(100% - 32px);
		display: flex;
		flex-direction: column;
		background: var(--paper);
		border-radius: 4px;
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
		z-index: 6;
		cursor: default;
	}

	.quiz-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 12px 10px 16px;
		border-bottom: 1.5px solid var(--ink);
	}

	.quiz-title {
		font-weight: 900;
		font-stretch: 125%;
		text-transform: uppercase;
		font-size: 15px;
	}

	.quiz-body {
		padding: 14px 16px 16px;
		overflow-y: auto;
		font-size: 13.5px;
		line-height: 1.5;
	}

	.quiz-q {
		font-weight: 600;
		margin: 0 0 12px;
	}

	.quiz-options {
		display: grid;
		gap: 6px;
	}

	.quiz-option {
		display: flex;
		gap: 10px;
		align-items: flex-start;
		text-align: left;
		background: var(--surface);
		border: 1.5px solid var(--rule);
		border-radius: 3px;
		padding: 8px 10px;
		font: inherit;
		color: var(--ink);
		cursor: pointer;
	}

	.quiz-option:hover:not(:disabled) {
		border-color: var(--ink);
	}

	.quiz-option:disabled {
		cursor: default;
		color: var(--muted);
	}

	.quiz-option .letter {
		font-weight: 800;
		min-width: 12px;
	}

	.quiz-option.correct {
		border-color: var(--good);
		background: #e7eedf;
		color: var(--ink);
	}

	.quiz-option.wrong {
		border-color: var(--danger);
		background: #f6e1da;
		color: var(--ink);
	}

	.quiz-feedback {
		margin-top: 12px;
		padding-left: 10px;
		border-left: 3px solid var(--danger);
	}

	.quiz-feedback.correct {
		border-color: var(--good);
	}

	.quiz-feedback p {
		margin: 4px 0 0;
		color: var(--muted);
	}

	.quiz-next {
		margin-top: 14px;
		width: 100%;
	}

	/* ── Bottom panel ── */
	.bottom {
		display: grid;
		grid-template-columns: 1fr minmax(280px, 360px);
		background: var(--paper);
		height: 188px;
		flex-shrink: 0;
	}

	.region {
		padding: 16px 24px;
		display: flex;
		flex-direction: column;
		min-width: 0;
		overflow: hidden;
	}

	.region-head {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
	}

	.region-name {
		font-size: 34px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		padding-top: 2px;
	}

	.region-name.muted {
		color: var(--faint);
		font-size: 26px;
	}

	.region-hint {
		margin: 10px 0 auto;
		color: var(--muted);
	}

	.pill {
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: #fff;
		background: var(--accent);
		padding: 3px 7px;
		border-radius: 2px;
		flex-shrink: 0;
	}

	.facts {
		display: flex;
		gap: 36px;
		margin: 14px 0 auto;
	}

	.facts dt {
		font-size: 11px;
		font-weight: 700;
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.facts dd {
		margin: 1px 0 0;
		font-size: 16px;
		font-weight: 600;
	}

	.actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}

	.log {
		padding: 14px 20px;
		overflow-y: auto;
		border-left: 1.5px solid var(--ink);
		min-width: 0;
	}

	.log h3 {
		margin: 0 0 6px;
	}

	.log ol {
		list-style: none;
		margin: 0;
		padding: 0;
		font-size: 13px;
	}

	.log li {
		display: grid;
		grid-template-columns: 58px 1fr;
		gap: 8px;
		padding: 3px 0;
	}

	.log-year {
		color: var(--faint);
	}

	.log li.event span:last-child {
		color: var(--info);
		font-weight: 600;
	}

	.log-empty {
		color: var(--faint);
		margin: 0;
	}

	/* ── Evolution tree ── */
	.evolve {
		position: fixed;
		inset: 0;
		z-index: 2000;
		background: var(--paper);
		display: grid;
		grid-template-columns: 1fr 360px;
	}

	.evolve-main {
		padding: 32px 40px;
		overflow: auto;
		display: flex;
		flex-direction: column;
	}

	.evolve-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 24px;
		margin-bottom: 28px;
	}

	.evolve-title {
		font-size: 48px;
	}

	.evolve-dna {
		font-size: 13px;
		font-weight: 700;
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.evolve-dna b {
		font-size: 30px;
		font-weight: 800;
		font-stretch: 112%;
		color: var(--accent);
		margin-left: 6px;
		letter-spacing: 0;
	}

	.t-roots {
		display: flex;
		flex-direction: column;
		gap: 14px;
		align-items: flex-start;
	}

	.t-row {
		display: flex;
		align-items: center;
	}

	.t-kids {
		position: relative;
		display: flex;
		flex-direction: column;
		padding-left: 28px;
	}

	.t-kids::before {
		content: '';
		position: absolute;
		left: 0;
		top: 50%;
		width: 14px;
		border-top: 1.5px solid var(--ink);
	}

	.t-kid {
		position: relative;
		display: flex;
		align-items: center;
		padding: 4px 0;
	}

	.t-kid::before {
		content: '';
		position: absolute;
		left: -14px;
		top: 50%;
		width: 14px;
		border-top: 1.5px solid var(--ink);
	}

	.t-kid::after {
		content: '';
		position: absolute;
		left: -14px;
		top: 0;
		bottom: 0;
		border-left: 1.5px solid var(--ink);
	}

	.t-kid:first-child::after {
		top: 50%;
	}

	.t-kid:last-child::after {
		bottom: 50%;
	}

	.t-kid:only-child::after {
		display: none;
	}

	.t-node {
		width: 210px;
		height: 46px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 0 12px;
		border: 1.5px solid var(--ink);
		border-radius: 3px;
		background: var(--surface);
		font: 600 13px var(--font);
		color: var(--ink);
		cursor: pointer;
		text-align: left;
		flex-shrink: 0;
	}

	.t-node:hover {
		background: #fff;
	}

	.t-cost {
		font-size: 12px;
		font-weight: 700;
		color: var(--muted);
	}

	.t-node.owned {
		background: var(--ink);
		color: var(--paper);
	}

	.t-node.owned .t-cost {
		color: var(--paper);
	}

	.t-node.expensive .t-cost {
		color: var(--danger);
	}

	.t-node.locked {
		border-style: dashed;
		border-color: var(--faint);
		color: var(--faint);
		background: transparent;
	}

	.t-node.locked .t-cost {
		color: var(--faint);
	}

	.t-node.selected {
		outline: 3px solid var(--accent);
		outline-offset: 2px;
	}

	.evolve-foot {
		margin-top: auto;
		padding-top: 28px;
	}

	.evolve-detail {
		background: var(--surface);
		border-left: 1.5px solid var(--ink);
		padding: 32px 28px;
		display: flex;
		flex-direction: column;
		overflow-y: auto;
	}

	.detail-name {
		font-size: 28px;
		margin-bottom: 8px;
	}

	.detail-meta {
		margin-bottom: 16px;
	}

	.detail-desc {
		margin: 0 0 18px;
		font-size: 14.5px;
		line-height: 1.55;
	}

	.effects {
		list-style: none;
		padding: 0;
		margin: 0 0 auto;
		font-size: 13px;
	}

	.effects li {
		display: flex;
		justify-content: space-between;
		padding: 7px 0;
		border-top: 1px solid var(--rule);
	}

	.effects li:last-child {
		border-bottom: 1px solid var(--rule);
	}

	.effects b {
		font-weight: 700;
	}

	.detail-buy {
		margin-top: 24px;
		padding: 13px;
		font-size: 14px;
		white-space: normal;
	}

	/* ── Narrow screens ── */
	@media (max-width: 900px) {
		.topbar {
			flex-wrap: wrap;
			gap: 8px 16px;
			padding: 10px 16px;
		}

		/* Single line so a longer year count can't add a row and shift the map. */
		.stats {
			margin-left: 0;
			width: 100%;
			gap: 14px;
			flex-wrap: nowrap;
			overflow: hidden;
		}

		/* Fixed height so the map doesn't jump when a country is (de)selected. */
		.bottom {
			grid-template-columns: 1fr;
			height: 152px;
		}

		.log {
			display: none;
		}

		.region {
			padding: 14px 16px;
		}

		.evolve {
			grid-template-columns: 1fr;
			grid-template-rows: 1fr auto;
		}

		.evolve-main {
			padding: 24px 16px;
		}

		.evolve-detail {
			border-left: 0;
			border-top: 1.5px solid var(--ink);
			max-height: 45vh;
			padding: 20px 16px;
		}
	}
</style>

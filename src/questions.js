export const apBioQuestions = [
    {
        question: "An individual born with a high-investment strategy (Type I curve) faces environmental shifts. Which evolutionary concept explains why its learned behaviors cannot be directly written into its DNA for its offspring?",
        options: [
            "The Central Dogma of Molecular Biology states information flows from DNA to RNA to Protein, not backwards.",
            "Natural selection only operates on phenotypic changes acquired during an organism's lifetime.",
            "Epigenetic modifications completely erase all parental behavioral traits during meiosis.",
            "Translation models do not allow amino acid sequences to alter tRNA anticodons."
        ],
        answer: 0,
        explanation: "According to the Central Dogma, genetic information flows strictly from nucleic acids to proteins. Phenotypic adaptations or behaviors acquired during life cannot reverse-engineer changes back into the germline DNA sequence."
    },
    {
        question: "A population of r-selected marine invertebrates experiences an oil spill that selectively kills 99% of its planktonic larvae. If this population evolves resistance over generations, which parameter of population genetics is primarily driving this shift?",
        options: [
            "Genetic drift due to a severe bottleneck effect.",
            "Directional selection favoring individuals with specific detoxifying alleles.",
            "Stabilizing selection keeping the allele frequencies near the ancestral mean.",
            "Increased gene flow from adjacent unaffected deep-ocean basins."
        ],
        answer: 1,
        explanation: "Because the environmental pressure (the spill) selectively targets individuals based on survival traits, this is directional natural selection favoring toxin-resistant alleles, rather than purely random genetic drift."
    },
    {
        question: "Why do Type III survivorship species typically allocate significantly less metabolic energy to individual yolk mass or parental care compared to Type I species?",
        options: [
            "Their carrying capacity (K) is infinite, making energy allocation unnecessary.",
            "High early mortality rates make individual offspring investment evolutionarily inefficient compared to maximizing numbers.",
            "They lack the homeostatic mechanisms required to convert lipids into yolk proteins.",
            "They rely exclusively on horizontal gene transfer to sustain early larval development."
        ],
        answer: 1,
        explanation: "r-selected (Type III) strategies maximize fitness by channeling energy into offspring quantity. Because the probability of individual juvenile survival is extremely low, high investment per individual would drastically lower overall reproductive output."
    },
    {
        question: "A researcher models population growth using a mixture regression framework and finds a sudden shift in the intrinsic growth rate (r). Which environmental factor most likely caused a structural break in the model parameters?",
        options: [
            "The population size reached its carrying capacity (K), causing density-dependent restrictions.",
            "A harmless mutation accumulated in a non-coding, highly conserved pseudogene.",
            "The species successfully evolved a trait that bypassed a primary climate restriction.",
            "An increase in geographic distance from the native origin country without physical barriers."
        ],
        answer: 2,
        explanation: "Evolving an adaptive trait (like cold or heat resistance) allows a population to exploit previously uninhabitable niches, shifting its ecological parameters and changing the functional growth rate within that region."
    },
    {
        question: "Which molecular mechanism allows some Type III species to acquire environmental adaptation traits via Horizontal Gene Transfer (HGT) rather than vertical descent?",
        options: [
            "Direct transformation or plasmid uptake from coexisting microbial or legal symbiotic entities.",
            "Alternative RNA splicing rearranges exons into entirely new structural domains during mitosis.",
            "Retrotransposons copy host proteins back into the mitochondrial genome.",
            "Homologous recombination between non-sister chromatids during Prophase I."
        ],
        answer: 0,
        explanation: "Horizontal Gene Transfer involves the non-reproductive transfer of genetic material between distinct organisms, often mediated via plasmids, viral vectors, or direct transformation/environmental DNA uptake."
    },
    {
        question: "An uncoupling protein (UCP1) is introduced into the inner mitochondrial membrane of a mammalian cell, allowing protons to leak freely back into the matrix. What is the immediate effect on ATP synthesis and oxygen consumption?",
        options: [
            "ATP synthesis increases due to a steeper proton gradient, while oxygen consumption stops.",
            "ATP synthesis decreases because the proton motive force is dissipated, while oxygen consumption increases or continues.",
            "Both ATP synthesis and oxygen consumption completely shut down due to feedback inhibition.",
            "Oxygen consumption drops to zero because the electron transport chain can no longer pump protons."
        ],
        answer: 1,
        explanation: "Uncoupling proteins allow protons to bypass ATP synthase, destroying the proton gradient needed to drive ATP synthesis. However, the electron transport chain keeps pumping protons furiously to try and rebuild the gradient, consuming oxygen at an accelerated rate."
    },
    {
        question: "A mutation in a G protein-coupled receptor (GPCR) prevents the associated G protein from hydrolyzing its bound GTP into GDP. What is the consequence for the intracellular signaling pathway?",
        options: [
            "The pathway is permanently inactivated because GDP cannot bind to the receptor.",
            "The pathway remains continuously active because the G protein stays in its active configuration.",
            "The ligand will bind permanently to the extracellular domain of the receptor.",
            "Target cells will immediately downregulate the expression of all adenylate cyclase enzymes."
        ],
        answer: 1,
        explanation: "GTP hydrolysis acts as the built-in 'off switch' for G proteins. If the G protein cannot convert its GTP back to GDP, it remains perpetually stuck in its active state, continuously triggering downstream target proteins even without a signaling ligand."
    },
    {
        question: "In a certain plant species, a cross between a true-breeding purple-flowered plant and a true-breeding white-flowered plant yields all purple F1 offspring. When the F1 generation is self-pollinated, the F2 generation shows a 9:7 ratio of purple to white flowers. Which genetic phenomenon best explains this inheritance pattern?",
        options: [
            "Incomplete dominance where the heterozygote displays an intermediate phenotype.",
            "Codominance resulting in both alleles being expressed simultaneously in the petals.",
            "Complementary epistasis, where dominant alleles of two distinct genes are required to produce the purple pigment.",
            "Sex-linked inheritance where the color gene is carried exclusively on the maternal chromosome."
        ],
        answer: 2,
        explanation: "A 9:7 phenotypic ratio in the F2 generation is a classic variation of the standard 9:3:3:1 dihybrid ratio. It indicates complementary epistasis, meaning a functional enzyme from two different genes (A_B_) is required to complete the metabolic pathway that creates the purple color. If either gene is homozygous recessive (aa or bb), the flower remains white."
    },
    {
        question: "A viral pathogen injects its double-stranded DNA genome into a host cell. If the virus contains a mutation that disables its topoisomerase enzyme, which process will be directly halted during viral replication?",
        options: [
            "The initiation of transcription due to a lack of RNA polymerase binding sites.",
            "The elongation of the polypeptide chain at the host ribosome.",
            "The unwinding of the replication fork, leading to severe DNA overwinding and torsional strain.",
            "The packaging of viral capsids due to a lack of structural proteins."
        ],
        answer: 2,
        explanation: "As helicase unwinds double-stranded DNA during replication, it creates supercoiling and extreme torsional strain ahead of the replication fork. Topoisomerase cuts, rotates, and rejoins the DNA strands to relieve this tension. Without it, the DNA becomes too tightly overwound for replication to progress."
    },
    {
        question: "A researcher exposes facultative anaerobic yeast cells to an environment completely devoid of oxygen. To maintain the exact same cellular ATP levels as they had in an aerobic environment, how must the yeast alter their rate of glucose consumption?",
        options: [
            "They must decrease glucose consumption because fermentation is highly efficient.",
            "They must maintain the exact same rate of glucose consumption by relying on alternative electron acceptors.",
            "They must drastically increase glucose consumption because fermentation yields significantly less ATP per glucose molecule.",
            "They must stop glucose consumption entirely and switch to breaking down stored lipids via beta-oxidation."
        ],
        answer: 2,
        explanation: "Aerobic respiration generates roughly 30 to 32 ATP per molecule of glucose, whereas fermentation (anaerobic) yields only 2 net ATP per glucose. Therefore, to meet the same energetic demands without oxygen, the yeast cells must consume up to 15 to 16 times more glucose to stay alive."
    }
];

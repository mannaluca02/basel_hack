// Customer-facing text. Stable protocol/financial codes are deliberately not translated.
export const Messages = {
  "voice.issue.NOT_COLLECTED_FOR_DEMO": {"de": "Diese Angabe wird in der Sprachdemo nicht erhoben.", "fr": "Cette information n’est pas recueillie dans la démonstration vocale.", "it": "Questa informazione non viene raccolta nella demo vocale.", "en": "This detail is not collected in the voice demonstration."},
  "voice.issue.HUMAN_REVIEW_REQUIRED": {"de": "Diese Angabe erfordert eine persönliche Eignungsprüfung.", "fr": "Cette information nécessite une évaluation personnelle de l’adéquation.", "it": "Questa informazione richiede una valutazione personale dell’adeguatezza.", "en": "This detail requires a human suitability review."},
  "voice.issue.LOOKUP_REQUIRED": {"de": "Bitte den passenden Ort aus der Standortsuche auswählen.", "fr": "Veuillez sélectionner le lieu approprié dans la recherche de localités.", "it": "Selezioni la località corretta nella ricerca delle località.", "en": "Please select the matching location from the location search."},
  "voice.issue.STRUCTURED_INPUT_REQUIRED": {"de": "Dafür benötigen wir eine strukturierte Angabe mit den zugehörigen Details.", "fr": "Une saisie structurée avec les détails correspondants est nécessaire.", "it": "È necessario un inserimento strutturato con i dettagli pertinenti.", "en": "We need structured input with the related details for this."},
  "voice.issue.TARGET_MISSING": {"de": "Bitte zuerst die zugehörige Person oder den passenden Eintrag im Fall erfassen.", "fr": "Veuillez d’abord créer la personne ou l’entrée correspondante dans le dossier.", "it": "Inserisca prima la persona o la voce corrispondente nel caso.", "en": "Please first add the relevant person or entry to the case."},
  "voice.issue.AMBIGUOUS_VALUE": {"de": "Bitte den Wert und gegebenenfalls Zeitraum sowie Brutto-/Nettobasis präzisieren.", "fr": "Veuillez préciser la valeur et, si nécessaire, la période et la base brute ou nette.", "it": "Precisi il valore e, se necessario, il periodo e la base lorda o netta.", "en": "Please clarify the value and, where relevant, its period and gross or net basis."},
  "voice.error.disabled": {"de": "Dieser Sprachprovider ist für die Demo noch nicht konfiguriert oder aktiviert.", "fr": "Ce fournisseur vocal n’est pas encore configuré ou activé pour la démonstration.", "it": "Questo provider vocale non è ancora configurato o attivato per la demo.", "en": "This voice provider is not configured or enabled for the demonstration yet."},
  "voice.error.inactive": {"de": "Diese Sprachsession ist beendet oder passt nicht mehr zur aktuellen Sprache. Bitte neu starten.", "fr": "Cette session vocale est terminée ou ne correspond plus à la langue actuelle. Veuillez la redémarrer.", "it": "Questa sessione vocale è terminata o non corrisponde più alla lingua attuale. La riavvii.", "en": "This voice session has ended or no longer matches the current language. Please restart it."},
  "voice.error.connectionExpired": {"de": "Die kurzlebigen Verbindungsdaten sind nicht mehr verfügbar. Bitte eine neue Sprachsession starten.", "fr": "Les données de connexion temporaires ne sont plus disponibles. Veuillez démarrer une nouvelle session vocale.", "it": "I dati di connessione temporanei non sono più disponibili. Avvii una nuova sessione vocale.", "en": "The short-lived connection details are no longer available. Please start a new voice session."},
  "voice.error.alreadyActive": {"de": "Eine Sprachsession läuft bereits oder wird gerade gestartet. Bitte diese zuerst beenden.", "fr": "Une session vocale est déjà active ou en cours de démarrage. Veuillez d’abord la terminer.", "it": "Una sessione vocale è già attiva o in avvio. La termini prima.", "en": "A voice session is already active or starting. Please end it first."},
  "voice.error.source": {"de": "Die Angabe konnte keinem passenden finalen Kundentranskript zugeordnet werden. Bitte die Quelle prüfen.", "fr": "L’information ne correspond à aucune transcription finale du client. Veuillez vérifier la source.", "it": "L’informazione non corrisponde ad alcuna trascrizione finale del cliente. Verifichi la fonte.", "en": "The observation could not be linked to a matching final customer transcript. Please check its source."},
  "extraction.error.disabled": {"de": "Die KI-Extraktion ist für diese Demo nicht aktiviert. Bitte Angaben direkt erfassen.", "fr": "L’extraction IA n’est pas activée pour cette démonstration. Veuillez saisir les données directement.", "it": "L’estrazione IA non è attivata per questa demo. Inserisca i dati direttamente.", "en": "AI extraction is not enabled for this demonstration. Please enter the details directly."},
  "extraction.error.consent": {"de": "Für die KI-Extraktion fehlt Ihre Zustimmung zum aktuellen Hinweis. Bitte Hinweis lesen und erneut zustimmen.", "fr": "Votre accord à la notice actuelle d’extraction IA manque. Veuillez lire la notice et donner à nouveau votre accord.", "it": "Manca il suo consenso all’informativa attuale sull’estrazione IA. Legga l’informativa e confermi di nuovo.", "en": "Your consent to the current AI extraction notice is missing. Please read the notice and consent again."},
  "error.handoverActive": {"de": "Die digitale Beratung ist für die gewünschte persönliche Beratung pausiert. Sie können sie ausdrücklich wieder aufnehmen.", "fr": "Le conseil numérique est en pause pour le conseil personnel demandé. Vous pouvez le reprendre explicitement.", "it": "La consulenza digitale è in pausa per la consulenza personale richiesta. Può riprenderla esplicitamente.", "en": "Digital advice is paused for the requested personal advice. You can explicitly resume it."},
  "error.digitalCancelled": {"de": "Die digitale Verarbeitung wurde abgebrochen. Bitte starten Sie bei Bedarf eine neue Anfrage.", "fr": "Le traitement numérique a été annulé. Lancez une nouvelle demande si nécessaire.", "it": "L’elaborazione digitale è stata annullata. Se necessario avvii una nuova richiesta.", "en": "Digital processing was cancelled. Start a new request if needed."},
  "common.title": {
    "de": "Pax LifeMap – Vorsorgeübersicht",
    "fr": "Pax LifeMap – aperçu de la prévoyance",
    "it": "Pax LifeMap – panoramica previdenziale",
    "en": "Pax LifeMap – pension overview"
  },
  "common.customer": {
    "de": "Kundensicht",
    "fr": "Vue client",
    "it": "Vista cliente",
    "en": "Customer view"
  },
  "common.advisor": {
    "de": "Fachpersonensicht",
    "fr": "Vue spécialiste",
    "it": "Vista specialista",
    "en": "Advisor view"
  },
  "common.demo": {
    "de": "DEMO – KEIN VERSICHERUNGSSCHUTZ",
    "fr": "DÉMONSTRATION – AUCUNE COUVERTURE D’ASSURANCE",
    "it": "DIMOSTRAZIONE – NESSUNA COPERTURA ASSICURATIVA",
    "en": "DEMO – NO INSURANCE COVER"
  },
  "common.disclaimer": {
    "de": "Diese Testkonfiguration ist keine echte Offerte, Unterschrift, Annahme oder Police von Pax.",
    "fr": "Cette configuration de test ne constitue ni une offre réelle, ni une signature, une acceptation ou une police de Pax.",
    "it": "Questa configurazione di prova non costituisce un’offerta reale, una firma, un’accettazione o una polizza di Pax.",
    "en": "This test configuration is not a real Pax quotation, signature, acceptance or policy."
  },
  "common.unknown": {
    "de": "Unbekannt",
    "fr": "Inconnu",
    "it": "Sconosciuto",
    "en": "Unknown"
  },
  "common.case": {
    "de": "Fall",
    "fr": "Dossier",
    "it": "Caso",
    "en": "Case"
  },
  "common.profile": {
    "de": "Profilstand",
    "fr": "Version du profil",
    "it": "Versione del profilo",
    "en": "Profile version"
  },
  "common.person": {
    "de": "Person",
    "fr": "Personne",
    "it": "Persona",
    "en": "Person"
  },
  "common.snapshot": {
    "de": "Datenstand",
    "fr": "Instantané",
    "it": "Istantanea",
    "en": "Snapshot"
  },
  "common.metric": {
    "de": "Kennzahl",
    "fr": "Indicateur",
    "it": "Indicatore",
    "en": "Metric"
  },
  "common.figure": {
    "de": "Vorsorgekennzahl",
    "fr": "Indicateur de prévoyance",
    "it": "Indicatore previdenziale",
    "en": "Pension metric"
  },
  "common.period": {
    "de": "Zeitraum",
    "fr": "Période",
    "it": "Periodo",
    "en": "Period"
  },
  "common.status": {
    "de": "Prüfstatus",
    "fr": "Statut de vérification",
    "it": "Stato di verifica",
    "en": "Review status"
  },
  "common.results": {
    "de": "Bestätigter Bedarf und Ergebnisse",
    "fr": "Besoins confirmés et résultats",
    "it": "Fabbisogno confermato e risultati",
    "en": "Confirmed needs and results"
  },
  "common.goals": {
    "de": "Lebensziele",
    "fr": "Objectifs de vie",
    "it": "Obiettivi di vita",
    "en": "Life goals"
  },
  "common.assumptions": {
    "de": "Annahmen und fachliche Vorbehalte",
    "fr": "Hypothèses et réserves techniques",
    "it": "Ipotesi e riserve tecniche",
    "en": "Assumptions and professional caveats"
  },
  "common.risks": {
    "de": "Lebensversicherungsbedarf",
    "fr": "Besoins en assurance vie",
    "it": "Fabbisogno di assicurazione sulla vita",
    "en": "Life insurance needs"
  },
  "common.recommendations": {
    "de": "Passende Möglichkeiten nach der Bedarfsanalyse",
    "fr": "Possibilités adaptées après l’analyse des besoins",
    "it": "Possibilità adeguate dopo l’analisi del fabbisogno",
    "en": "Suitable options after the needs analysis"
  },
  "common.portal": {
    "de": "Demo-Vertragsweg und Portal",
    "fr": "Parcours contractuel de démonstration et portail",
    "it": "Percorso contrattuale dimostrativo e portale",
    "en": "Demo contract journey and portal"
  },
  "common.sources": {
    "de": "Quellen und Nachvollziehbarkeit",
    "fr": "Sources et traçabilité",
    "it": "Fonti e tracciabilità",
    "en": "Sources and traceability"
  },
  "common.review": {
    "de": "Eine Fachperson muss diese Angaben und Annahmen prüfen.",
    "fr": "Un spécialiste doit vérifier ces données et hypothèses.",
    "it": "Uno specialista deve verificare questi dati e queste ipotesi.",
    "en": "A qualified advisor must review these inputs and assumptions."
  },
  "common.noPremium": {
    "de": "Eine persönliche Pax-Prämie liegt noch nicht vor.",
    "fr": "Aucune prime Pax personnelle n’est encore disponible.",
    "it": "Non è ancora disponibile un premio Pax personale.",
    "en": "An individual Pax premium is not yet available."
  },
  "common.documents": {
    "de": "Die verlinkten Originalunterlagen sind deutschsprachige Archivdokumente. Für einen echten Abschluss sind die aktuellen Unterlagen in der passenden Sprache erforderlich.",
    "fr": "Les documents originaux liés sont des archives en allemand. Une conclusion réelle exige les documents actuels dans la langue appropriée.",
    "it": "I documenti originali collegati sono archivi in tedesco. Per una conclusione reale occorrono documenti aggiornati nella lingua appropriata.",
    "en": "The linked originals are archived German documents. A real contract requires current documents in the appropriate language."
  },
  "common.condition": {
    "de": "Produktunterlagen, Alter, Laufzeit, Begünstigung, Ausschlüsse und persönlicher Spielraum müssen geprüft werden.",
    "fr": "Les documents du produit, l’âge, la durée, les bénéficiaires, les exclusions et la capacité financière personnelle doivent être vérifiés.",
    "it": "Occorre verificare documenti del prodotto, età, durata, beneficiari, esclusioni e capacità finanziaria personale.",
    "en": "Product documents, age, term, beneficiaries, exclusions and personal affordability require review."
  },
  "common.noContract": {
    "de": "Bestehenden Schutz beibehalten und keinen zusätzlichen Vertrag abschliessen.",
    "fr": "Conserver la protection existante sans conclure de contrat supplémentaire.",
    "it": "Mantenere la protezione esistente senza stipulare un contratto aggiuntivo.",
    "en": "Keep existing cover and make no additional contract."
  },
  "common.adjust": {
    "de": "Ziel anpassen, Liquidität schützen oder vor einer Entscheidung eine Fachperson einbeziehen.",
    "fr": "Adapter l’objectif, préserver les liquidités ou consulter un spécialiste avant de décider.",
    "it": "Adeguare l’obiettivo, proteggere la liquidità o consultare uno specialista prima di decidere.",
    "en": "Adjust the goal, protect liquidity or obtain professional advice before deciding."
  },
  "common.need": {
    "de": "Jährlicher Bedarf",
    "fr": "Besoin annuel",
    "it": "Fabbisogno annuo",
    "en": "Annual need"
  },
  "common.gap": {
    "de": "Jährliche Lücke",
    "fr": "Lacune annuelle",
    "it": "Lacuna annua",
    "en": "Annual shortfall"
  },
  "common.capitalNeed": {
    "de": "Zusätzliches Todesfallkapital",
    "fr": "Capital décès supplémentaire",
    "it": "Capitale aggiuntivo in caso di decesso",
    "en": "Additional death capital"
  },
  "common.question": {
    "de": "Bitte ergänzen oder bestätigen Sie diese Angabe.",
    "fr": "Veuillez compléter ou confirmer cette information.",
    "it": "Completi o confermi questa informazione.",
    "en": "Please provide or confirm this information."
  },
  "common.target": {
    "de": "Zielbetrag",
    "fr": "Montant cible",
    "it": "Importo obiettivo",
    "en": "Target amount"
  },
  "common.none": {
    "de": "Keine zusätzlichen Einträge",
    "fr": "Aucune entrée supplémentaire",
    "it": "Nessuna voce aggiuntiva",
    "en": "No additional entries"
  },
  "period.month": {
    "de": "pro Monat",
    "fr": "par mois",
    "it": "al mese",
    "en": "per month"
  },
  "period.year": {
    "de": "pro Jahr",
    "fr": "par an",
    "it": "all’anno",
    "en": "per year"
  },
  "period.once": {
    "de": "einmaliges Kapital",
    "fr": "capital unique",
    "it": "capitale una tantum",
    "en": "one-off capital"
  },
  "status.valid": {
    "de": "Verwendbar",
    "fr": "Utilisable",
    "it": "Utilizzabile",
    "en": "Usable"
  },
  "status.estimated": {
    "de": "Schätzung",
    "fr": "Estimation",
    "it": "Stima",
    "en": "Estimate"
  },
  "status.requires_review": {
    "de": "Fachprüfung erforderlich",
    "fr": "Vérification spécialisée requise",
    "it": "Verifica specialistica necessaria",
    "en": "Professional review required"
  },
  "status.needs_input": {
    "de": "Angaben fehlen",
    "fr": "Informations manquantes",
    "it": "Informazioni mancanti",
    "en": "Missing information"
  },
  "status.provider_error": {
    "de": "Rechner nicht verfügbar",
    "fr": "Calculateur indisponible",
    "it": "Calcolatore non disponibile",
    "en": "Calculator unavailable"
  },
  "status.unsupported": {
    "de": "Nicht unterstützt",
    "fr": "Non pris en charge",
    "it": "Non supportato",
    "en": "Unsupported"
  },
  "status.stale": {
    "de": "Veraltet",
    "fr": "Obsolète",
    "it": "Obsoleto",
    "en": "Outdated"
  },
  "status.current": {
    "de": "Aktueller Rechenstand",
    "fr": "Calcul actuel",
    "it": "Calcolo attuale",
    "en": "Current calculation"
  },
  "status.open": {
    "de": "Prüfung offen",
    "fr": "Vérification ouverte",
    "it": "Verifica aperta",
    "en": "Review open"
  },
  "status.approved_for_demo": {
    "de": "Für die Demo geprüft",
    "fr": "Vérifié pour la démonstration",
    "it": "Verificato per la dimostrazione",
    "en": "Reviewed for demo"
  },
  "status.ready_for_demo": {
    "de": "Für Demo bereit",
    "fr": "Prêt pour la démonstration",
    "it": "Pronto per la dimostrazione",
    "en": "Ready for demo"
  },
  "status.human_review_required": {
    "de": "Fachperson erforderlich",
    "fr": "Spécialiste nécessaire",
    "it": "Specialista necessario",
    "en": "Advisor required"
  },
  "status.no_new_contract": {
    "de": "Kein zusätzlicher Vertrag empfohlen",
    "fr": "Aucun contrat supplémentaire recommandé",
    "it": "Nessun contratto aggiuntivo consigliato",
    "en": "No additional contract recommended"
  },
  "status.draft": {
    "de": "Entwurf",
    "fr": "Brouillon",
    "it": "Bozza",
    "en": "Draft"
  },
  "status.submitted": {
    "de": "Eingereicht",
    "fr": "Transmis",
    "it": "Inviato",
    "en": "Submitted"
  },
  "status.under_review": {
    "de": "In Prüfung",
    "fr": "En cours de vérification",
    "it": "In verifica",
    "en": "Under review"
  },
  "status.needs_information": {
    "de": "Rückfragen offen",
    "fr": "Informations complémentaires requises",
    "it": "Informazioni aggiuntive richieste",
    "en": "More information required"
  },
  "status.accepted_for_demo": {
    "de": "Nur für Demo angenommen",
    "fr": "Accepté pour la démonstration uniquement",
    "it": "Accettato solo per la dimostrazione",
    "en": "Accepted for demo only"
  },
  "status.declined": {
    "de": "Abgelehnt",
    "fr": "Refusé",
    "it": "Rifiutato",
    "en": "Declined"
  },
  "question.goals": {
    "de": "Was möchten Sie für Familie, Eigenheim oder Pensionierung erreichen?",
    "fr": "Quels sont vos objectifs pour la famille, le logement ou la retraite ?",
    "it": "Quali sono i suoi obiettivi per famiglia, casa o pensione?",
    "en": "What would you like to achieve for family, home ownership or retirement?"
  },
  "question.financial": {
    "de": "Wie sehen Einkommen, Ausgaben, Vermögen und bisherige Vorsorge aus?",
    "fr": "Quels sont vos revenus, dépenses, avoirs et prévoyance existante ?",
    "it": "Quali sono reddito, spese, patrimonio e previdenza esistente?",
    "en": "What are your income, expenses, assets and existing pension arrangements?"
  },
  "question.insurance": {
    "de": "Welche Personen und finanziellen Risiken sollen wir gemeinsam betrachten?",
    "fr": "Quelles personnes et quels risques financiers devons-nous examiner ?",
    "it": "Quali persone e rischi finanziari dobbiamo esaminare?",
    "en": "Which people and financial risks should we consider?"
  },
  "question.partner": {
    "de": "Bitte ergänzen Sie die finanzielle Situation Ihrer Partnerin oder Ihres Partners.",
    "fr": "Veuillez compléter la situation financière de votre partenaire.",
    "it": "Completi la situazione finanziaria del partner.",
    "en": "Please add your partner’s financial situation."
  },
  "question.relationship": {
    "de": "Wie ist Ihre aktuelle Partnerschafts- oder Familiensituation?",
    "fr": "Quelle est votre situation de couple ou familiale actuelle ?",
    "it": "Qual è la sua attuale situazione di coppia o familiare?",
    "en": "What is your current relationship or family situation?"
  },
  "question.relationshipSinceYear": {
    "de": "Seit welchem Jahr besteht diese Partnerschaft?",
    "fr": "Depuis quelle année cette relation existe-t-elle ?",
    "it": "Da quale anno esiste questa relazione?",
    "en": "In which year did this relationship begin?"
  },
  "question.sharedChildren": {
    "de": "Wie viele gemeinsame Kinder haben Sie?",
    "fr": "Combien avez-vous d’enfants communs ?",
    "it": "Quanti figli avete in comune?",
    "en": "How many children do you have together?"
  },
  "question.children": {
    "de": "Welche Kinder und Unterhaltspflichten sollen berücksichtigt werden?",
    "fr": "Quels enfants et obligations d’entretien faut-il prendre en compte ?",
    "it": "Quali figli e obblighi di mantenimento vanno considerati?",
    "en": "Which children and support obligations should we consider?"
  },
  "question.supportUntilMonth": {
    "de": "Bis zu welchem Monat möchten Sie den Unterhalt für dieses Kind berücksichtigen?",
    "fr": "Jusqu’à quel mois souhaitez-vous prévoir l’entretien de cet enfant ?",
    "it": "Fino a quale mese desidera prevedere il mantenimento di questo figlio?",
    "en": "Until which month should support for this child be planned?"
  },
  "question.birthYear": {
    "de": "In welchem Jahr wurde die betreffende Person geboren?",
    "fr": "En quelle année la personne concernée est-elle née ?",
    "it": "In quale anno è nata la persona interessata?",
    "en": "In which year was the person concerned born?"
  },
  "question.providerSex": {
    "de": "Welche Angabe zum Geschlecht ist in Ihren Vorsorgeunterlagen erfasst?",
    "fr": "Quelle mention du sexe figure dans vos documents de prévoyance ?",
    "it": "Quale indicazione del sesso figura nei suoi documenti previdenziali?",
    "en": "What sex is recorded in your pension documents?"
  },
  "question.grossAnnualIncomeCents": {
    "de": "Wie hoch ist Ihr jährliches Bruttoeinkommen?",
    "fr": "Quel est votre revenu annuel brut ?",
    "it": "Qual è il suo reddito annuo lordo?",
    "en": "What is your annual gross income?"
  },
  "question.income": {
    "de": "Wie hoch ist Ihr bestätigtes Einkommen nach Sozialabzügen und Einkommensteuern?",
    "fr": "Quel est votre revenu confirmé après cotisations sociales et impôts sur le revenu ?",
    "it": "Qual è il suo reddito confermato dopo contributi sociali e imposte sul reddito?",
    "en": "What is your confirmed income after social deductions and income tax?"
  },
  "question.withPillar2": {
    "de": "Sind Sie einer Pensionskasse angeschlossen?",
    "fr": "Êtes-vous affilié à une caisse de pension ?",
    "it": "È affiliato a una cassa pensione?",
    "en": "Are you a member of a pension fund?"
  },
  "question.deathNeedAnnualCents": {
    "de": "Welchen jährlichen Betrag brauchen Ihre Hinterbliebenen nach einem Todesfall?",
    "fr": "De quel montant annuel vos proches auraient-ils besoin après un décès ?",
    "it": "Di quale importo annuo avrebbero bisogno i superstiti dopo un decesso?",
    "en": "What annual amount would your survivors need after a death?"
  },
  "question.disabilityNeedAnnualCents": {
    "de": "Welches jährliche Einkommen benötigen Sie bei Erwerbsunfähigkeit?",
    "fr": "De quel revenu annuel auriez-vous besoin en cas d’incapacité de gain ?",
    "it": "Di quale reddito annuo avrebbe bisogno in caso di incapacità di guadagno?",
    "en": "What annual income would you need if unable to work?"
  },
  "question.personalAffordableAnnualPremiumCents": {
    "de": "Welchen Jahresbetrag können Sie persönlich zusätzlich tragen?",
    "fr": "Quel montant annuel supplémentaire pouvez-vous personnellement financer ?",
    "it": "Quale importo annuo aggiuntivo può sostenere personalmente?",
    "en": "What additional annual amount can you personally afford?"
  },
  "question.protectionTermMonths": {
    "de": "Wie lange soll der finanzielle Schutz reichen?",
    "fr": "Pendant combien de temps la protection financière doit-elle durer ?",
    "it": "Per quanto tempo deve durare la protezione finanziaria?",
    "en": "How long should the financial protection last?"
  },
  "question.existingDeathCapitalCents": {
    "de": "Welches Todesfallkapital ist bereits versichert?",
    "fr": "Quel capital décès est déjà assuré ?",
    "it": "Quale capitale in caso di decesso è già assicurato?",
    "en": "What death capital is already insured?"
  },
  "question.deathOneOffCostsCents": {
    "de": "Welche einmaligen Kosten sollen im Todesfall gedeckt sein?",
    "fr": "Quels frais uniques faut-il couvrir en cas de décès ?",
    "it": "Quali costi una tantum vanno coperti in caso di decesso?",
    "en": "Which one-off costs should be covered after a death?"
  },
  "question.debtPayoffCents": {
    "de": "Welcher Schuldbetrag soll im Todesfall zurückbezahlt werden?",
    "fr": "Quel montant de dette faut-il rembourser en cas de décès ?",
    "it": "Quale debito va rimborsato in caso di decesso?",
    "en": "How much debt should be repaid after a death?"
  },
  "question.debtTreatment": {
    "de": "Soll die Schuld über laufende Zahlungen oder als separate Rückzahlung berücksichtigt werden?",
    "fr": "Faut-il prévoir la dette dans les paiements courants ou comme remboursement séparé ?",
    "it": "Il debito va considerato nei pagamenti correnti o come rimborso separato?",
    "en": "Should debt be covered through ongoing payments or a separate repayment?"
  },
  "question.deathNeedExcludesRepaidDebtService": {
    "de": "Sind die Zahlungen für bereits zurückbezahlte Schulden aus dem Hinterbliebenenbedarf entfernt?",
    "fr": "Les paiements des dettes remboursées sont-ils exclus du besoin des survivants ?",
    "it": "I pagamenti dei debiti rimborsati sono esclusi dal fabbisogno dei superstiti?",
    "en": "Have payments for repaid debt been removed from the survivors’ needs?"
  },
  "question.riskCapitalStrategy": {
    "de": "Möchten Sie freie Mittel zuerst zur Absicherung einsetzen oder für andere Lebensziele bewahren?",
    "fr": "Souhaitez-vous utiliser d’abord vos liquidités pour la protection ou les préserver pour d’autres objectifs ?",
    "it": "Desidera usare prima la liquidità per la protezione o conservarla per altri obiettivi di vita?",
    "en": "Would you use free assets for protection first or preserve them for other life goals?"
  },
  "question.debtsConfirmed": {
    "de": "Sind alle Schulden und ihre laufenden Zahlungen erfasst?",
    "fr": "Toutes les dettes et leurs paiements courants sont-ils saisis ?",
    "it": "Sono registrati tutti i debiti e i relativi pagamenti correnti?",
    "en": "Have all debts and ongoing debt payments been captured?"
  },
  "question.existingPrivateRiskBenefitsConfirmed": {
    "de": "Sind alle bestehenden privaten Risiko-Renten erfasst, gegebenenfalls mit null?",
    "fr": "Toutes les rentes privées de risque existantes sont-elles saisies, y compris un zéro explicite si nécessaire ?",
    "it": "Sono registrate tutte le rendite private di rischio esistenti, anche con zero esplicito se necessario?",
    "en": "Have all existing private risk pensions been captured, including an explicit zero if applicable?"
  },
  "question.retirementPensionAnnualCents": {
    "de": "Welche jährliche PK-Rente ist in Ihrem Vorsorgeausweis ausgewiesen?",
    "fr": "Quelle rente annuelle de caisse de pension figure sur votre certificat ?",
    "it": "Quale rendita annua della cassa pensione figura nel suo certificato?",
    "en": "What annual pension-fund benefit is shown on your certificate?"
  },
  "question.desiredWorkStopAge": {
    "de": "In welchem Alter möchten Sie aufhören zu arbeiten?",
    "fr": "À quel âge souhaitez-vous arrêter de travailler ?",
    "it": "A quale età desidera smettere di lavorare?",
    "en": "At what age would you like to stop working?"
  },
  "question.retirementNeedAnnualCents": {
    "de": "Welchen jährlichen Betrag benötigen Sie im Ruhestand?",
    "fr": "De quel montant annuel aurez-vous besoin à la retraite ?",
    "it": "Di quale importo annuo avrà bisogno in pensione?",
    "en": "What annual amount will you need in retirement?"
  },
  "question.annualReturnBps": {
    "de": "Mit welcher ausdrücklich angenommenen jährlichen Rendite sollen wir rechnen?",
    "fr": "Quel rendement annuel hypothétique souhaitez-vous utiliser ?",
    "it": "Quale rendimento annuo ipotetico desidera utilizzare?",
    "en": "Which explicit annual return assumption should we use?"
  },
  "question.retirementHorizonAge": {
    "de": "Bis zu welchem Alter soll die Planung reichen?",
    "fr": "Jusqu’à quel âge la planification doit-elle aller ?",
    "it": "Fino a quale età deve arrivare la pianificazione?",
    "en": "Until what age should the plan extend?"
  },
  "question.annualSavingCents": {
    "de": "Welchen Betrag möchten Sie jährlich zusätzlich für die Vorsorge sparen?",
    "fr": "Quel montant souhaitez-vous épargner chaque année en plus pour la prévoyance ?",
    "it": "Quale importo desidera risparmiare ogni anno in aggiunta per la previdenza?",
    "en": "How much additional pension saving would you like to make each year?"
  },
  "question.existingAnnualRetirementSavingCents": {
    "de": "Wie viel sparen Sie bereits jährlich für die Pensionierung?",
    "fr": "Combien épargnez-vous déjà chaque année pour la retraite ?",
    "it": "Quanto risparmia già ogni anno per la pensione?",
    "en": "How much do you already save each year for retirement?"
  },
  "question.existingAnnualPillar3aContributionCents": {
    "de": "Wie hoch sind Ihre bereits laufenden jährlichen Beiträge in die Säule 3a?",
    "fr": "Quel est le total de vos cotisations annuelles actuelles au pilier 3a ?",
    "it": "Qual è il totale dei suoi contributi annui attuali al pilastro 3a?",
    "en": "What are your current total annual pillar 3a contributions?"
  },
  "question.taxLocationId": {
    "de": "In welcher Schweizer Gemeinde sind Sie steuerpflichtig?",
    "fr": "Dans quelle commune suisse êtes-vous imposé ?",
    "it": "In quale comune svizzero è assoggettato a imposta?",
    "en": "In which Swiss municipality are you taxed?"
  },
  "question.balanceCents": {
    "de": "Wie hoch ist die aktuelle Restschuld?",
    "fr": "Quel est le solde actuel de la dette ?",
    "it": "Qual è il debito residuo attuale?",
    "en": "What is the current outstanding debt?"
  },
  "question.annualServiceCents": {
    "de": "Wie hoch sind die jährlichen Zins- und Rückzahlungen dieser Schuld?",
    "fr": "Quel est le montant annuel des intérêts et remboursements de cette dette ?",
    "it": "Qual è l’importo annuo degli interessi e dei rimborsi di questo debito?",
    "en": "What are this debt’s annual interest and repayment costs?"
  },
  "question.pillar2Risk": {
    "de": "Welche Risiko-Leistungen stehen in Ihrem PK-Ausweis?",
    "fr": "Quelles prestations de risque figurent sur votre certificat de caisse de pension ?",
    "it": "Quali prestazioni di rischio figurano nel certificato della cassa pensione?",
    "en": "Which risk benefits are shown on your pension-fund certificate?"
  },
  "metric.incomeAnnual": {
    "de": "Jährliches Einkommen",
    "fr": "Revenu annuel",
    "it": "Reddito annuo",
    "en": "Annual income"
  },
  "metric.expensesAnnual": {
    "de": "Jährliche Ausgaben",
    "fr": "Dépenses annuelles",
    "it": "Spese annue",
    "en": "Annual expenses"
  },
  "metric.cashflowAnnual": {
    "de": "Jährlicher Überschuss oder Fehlbetrag",
    "fr": "Excédent ou déficit annuel",
    "it": "Eccedenza o disavanzo annuo",
    "en": "Annual surplus or deficit"
  },
  "metric.safetyBufferAnnual": {
    "de": "Jährlicher Sicherheitspuffer",
    "fr": "Marge de sécurité annuelle",
    "it": "Margine di sicurezza annuo",
    "en": "Annual safety buffer"
  },
  "metric.affordableContributionAnnual": {
    "de": "Zusätzlicher jährlicher Spielraum",
    "fr": "Marge annuelle supplémentaire",
    "it": "Margine annuo aggiuntivo",
    "en": "Additional annual capacity"
  },
  "metric.deficitAnnual": {
    "de": "Jährlicher Fehlbetrag",
    "fr": "Déficit annuel",
    "it": "Disavanzo annuo",
    "en": "Annual deficit"
  },
  "metric.freeCapital": {
    "de": "Frei verfügbares Kapital",
    "fr": "Capital librement disponible",
    "it": "Capitale liberamente disponibile",
    "en": "Freely available capital"
  },
  "metric.totalCapital": {
    "de": "Erfasstes Gesamtkapital",
    "fr": "Capital total saisi",
    "it": "Capitale totale registrato",
    "en": "Recorded total capital"
  },
  "metric.pillar3Capital": {
    "de": "Kapital der dritten Säule",
    "fr": "Capital du troisième pilier",
    "it": "Capitale del terzo pilastro",
    "en": "Third-pillar capital"
  },
  "metric.restrictedCapital": {
    "de": "Gebundenes Kapital",
    "fr": "Capital lié",
    "it": "Capitale vincolato",
    "en": "Restricted capital"
  },
  "metric.home_fundingGap": {
    "de": "Fehlende Eigenmittel",
    "fr": "Fonds propres manquants",
    "it": "Mezzi propri mancanti",
    "en": "Equity funding shortfall"
  },
  "metric.home_requiredCapital": {
    "de": "Benötigtes Eigenkapital",
    "fr": "Fonds propres nécessaires",
    "it": "Capitale proprio necessario",
    "en": "Required equity capital"
  },
  "metric.home_annualHousingCost": {
    "de": "Jährliche Wohnkosten im Szenario",
    "fr": "Coûts annuels du logement dans le scénario",
    "it": "Costi abitativi annui nello scenario",
    "en": "Annual scenario housing costs"
  },
  "metric.retirement_income": {
    "de": "Einkommen im Ruhestand",
    "fr": "Revenu à la retraite",
    "it": "Reddito in pensione",
    "en": "Retirement income"
  },
  "metric.retirement_need": {
    "de": "Bedarf im Ruhestand",
    "fr": "Besoin à la retraite",
    "it": "Fabbisogno in pensione",
    "en": "Retirement need"
  },
  "metric.retirement_capital": {
    "de": "Verbleibendes Kapital",
    "fr": "Capital restant",
    "it": "Capitale residuo",
    "en": "Remaining capital"
  },
  "metric.retirement_gap": {
    "de": "Ungedeckter Betrag",
    "fr": "Montant non couvert",
    "it": "Importo scoperto",
    "en": "Unfunded amount"
  },
  "metric.retirement_withdrawal": {
    "de": "Kapitalentnahme",
    "fr": "Prélèvement de capital",
    "it": "Prelievo di capitale",
    "en": "Capital withdrawal"
  },
  "metric.risk_gap": {
    "de": "Jährliche Versorgungslücke",
    "fr": "Lacune annuelle de prévoyance",
    "it": "Lacuna previdenziale annua",
    "en": "Annual protection shortfall"
  },
  "metric.pillar": {
    "de": "Leistung der Säule",
    "fr": "Prestation du pilier",
    "it": "Prestazione del pilastro",
    "en": "Pillar benefit"
  },
  "goal.family": {
    "de": "Familie",
    "fr": "Famille",
    "it": "Famiglia",
    "en": "Family"
  },
  "goal.home": {
    "de": "Eigenheim",
    "fr": "Logement en propriété",
    "it": "Abitazione di proprietà",
    "en": "Home ownership"
  },
  "goal.retirement": {
    "de": "Pensionierung",
    "fr": "Retraite",
    "it": "Pensionamento",
    "en": "Retirement"
  },
  "goal.child_protection": {
    "de": "Absicherung eines Kindes",
    "fr": "Protection d’un enfant",
    "it": "Protezione di un figlio",
    "en": "Child protection"
  },
  "goal.income_protection": {
    "de": "Einkommensschutz",
    "fr": "Protection du revenu",
    "it": "Protezione del reddito",
    "en": "Income protection"
  },
  "goal.survivor_protection": {
    "de": "Hinterbliebenenschutz",
    "fr": "Protection des survivants",
    "it": "Protezione dei superstiti",
    "en": "Survivor protection"
  },
  "event.disability_illness": {
    "de": "Erwerbsunfähigkeit durch Krankheit",
    "fr": "Incapacité de gain due à une maladie",
    "it": "Incapacità di guadagno per malattia",
    "en": "Disability due to illness"
  },
  "event.disability_accident": {
    "de": "Erwerbsunfähigkeit durch Unfall",
    "fr": "Incapacité de gain due à un accident",
    "it": "Incapacità di guadagno per infortunio",
    "en": "Disability due to accident"
  },
  "event.death_illness": {
    "de": "Tod durch Krankheit",
    "fr": "Décès dû à une maladie",
    "it": "Decesso per malattia",
    "en": "Death due to illness"
  },
  "event.death_accident": {
    "de": "Tod durch Unfall",
    "fr": "Décès dû à un accident",
    "it": "Decesso per infortunio",
    "en": "Death due to accident"
  },
  "product.pax_term_life": {
    "de": "Pax Todesfallschutz",
    "fr": "Pax – protection en cas de décès",
    "it": "Pax – protezione in caso di decesso",
    "en": "Pax death cover"
  },
  "product.pax_disability": {
    "de": "Pax Erwerbsunfähigkeitsschutz",
    "fr": "Pax – protection contre l’incapacité de gain",
    "it": "Pax – protezione per incapacità di guadagno",
    "en": "Pax disability protection"
  },
  "product.pax_3a": {
    "de": "Pax 3a",
    "fr": "Pax 3a",
    "it": "Pax 3a",
    "en": "Pax 3a"
  },
  "product.pax_fondsstar": {
    "de": "Pax FondsStar",
    "fr": "Pax FondsStar",
    "it": "Pax FondsStar",
    "en": "Pax FondsStar"
  },
  "product.pax_lifestar": {
    "de": "Pax LifeStar",
    "fr": "Pax LifeStar",
    "it": "Pax LifeStar",
    "en": "Pax LifeStar"
  },
  "product.pax_child": {
    "de": "Pax Kinderschutz und Sparen",
    "fr": "Pax – protection et épargne pour enfants",
    "it": "Pax – protezione e risparmio per figli",
    "en": "Pax child protection and saving"
  },
  "product.pax_payout": {
    "de": "Pax Auszahlungsplan",
    "fr": "Pax – plan de versements",
    "it": "Pax – piano di prelievo",
    "en": "Pax payout plan"
  },
  "assumption.synthetic": {
    "de": "Ausschliesslich erfundene Daten; die Berechnung ist keine Versicherungsannahme.",
    "fr": "Données fictives uniquement ; le calcul ne vaut pas acceptation d’assurance.",
    "it": "Solo dati inventati; il calcolo non costituisce accettazione assicurativa.",
    "en": "Invented data only; a calculation is not insurance acceptance."
  },
  "assumption.separate": {
    "de": "Staatliche, berufliche und private Leistungen sowie Kapital bleiben getrennte Grössen.",
    "fr": "Les prestations étatiques, professionnelles et privées ainsi que le capital restent distincts.",
    "it": "Le prestazioni statali, professionali e private e il capitale restano separati.",
    "en": "State, occupational and private benefits and capital remain separate quantities."
  },
  "assumption.snapshot": {
    "de": "Die aktuellen Jahreswerte sind eine Momentaufnahme und keine zeitlich wechselnde Rentenprognose.",
    "fr": "Les valeurs annuelles actuelles sont un instantané, pas une projection variable des rentes.",
    "it": "I valori annui attuali sono un’istantanea, non una proiezione variabile delle rendite.",
    "en": "Current annual values are a snapshot, not a time-varying pension forecast."
  },
  "assumption.rounding": {
    "de": "Geldbeträge werden in ganzen CHF-Rappen gerechnet; Anzeigerundungen verändern die Rechnung nicht.",
    "fr": "Les montants sont calculés en centimes de CHF entiers ; l’arrondi d’affichage ne modifie pas le calcul.",
    "it": "Gli importi sono calcolati in centesimi interi di CHF; l’arrotondamento visuale non modifica il calcolo.",
    "en": "Amounts are calculated in integer CHF cents; display rounding does not change calculations."
  },
  "assumption.family": {
    "de": "Die bestätigte lineare Lohnannahme verändert Steuern und PK-Leistungen nicht automatisch.",
    "fr": "L’hypothèse salariale linéaire confirmée ne modifie pas automatiquement les impôts et prestations de caisse de pension.",
    "it": "L’ipotesi salariale lineare confermata non modifica automaticamente imposte e prestazioni della cassa pensione.",
    "en": "The confirmed linear wage assumption does not automatically change taxes or pension-fund benefits."
  },
  "assumption.home": {
    "de": "Eigenmittel, Zins, Unterhalt und Amortisation sind Beispielannahmen und keine Kreditzusage.",
    "fr": "Fonds propres, intérêts, entretien et amortissement sont des hypothèses illustratives, pas un accord de crédit.",
    "it": "Mezzi propri, interessi, manutenzione e ammortamento sono ipotesi illustrative, non una concessione di credito.",
    "en": "Equity, interest, maintenance and amortisation are illustrative assumptions, not lending approval."
  },
  "assumption.phases": {
    "de": "Erwerbsende und Rentenbeginn sind getrennt; die Monatsprojektion ist keine Garantie.",
    "fr": "La fin d’activité et le début des rentes sont distincts ; la projection mensuelle n’est pas garantie.",
    "it": "La fine dell’attività e l’inizio delle rendite sono distinti; la proiezione mensile non è garantita.",
    "en": "Work exit and pension start are separate; the monthly projection is not guaranteed."
  },
  "assumption.pensions": {
    "de": "Rentenbeträge sind ausdrücklich eingegebene Annahmen und keine neu ermittelten Ansprüche.",
    "fr": "Les montants des rentes sont des hypothèses saisies, pas de nouveaux droits établis.",
    "it": "Gli importi delle rendite sono ipotesi inserite, non nuovi diritti accertati.",
    "en": "Pension amounts are entered assumptions, not newly established entitlements."
  },
  "assumption.allocations": {
    "de": "Für andere Ziele reserviertes Kapital ist ausgeschlossen; PK-Leistungen werden nicht pauschal hochgerechnet.",
    "fr": "Le capital réservé à d’autres objectifs est exclu ; les prestations de caisse de pension ne sont pas extrapolées automatiquement.",
    "it": "Il capitale riservato ad altri obiettivi è escluso; le prestazioni della cassa pensione non sono estrapolate automaticamente.",
    "en": "Capital reserved for other goals is excluded; pension-fund benefits are not automatically scaled."
  },
  "assumption.existingSaving": {
    "de": "Die Zusatzspar-Zeitachse legt bestehende private Prämien nicht nochmals an. Die separate Leistungsprojektion muss abgestimmt werden; beide Modelle werden nicht addiert.",
    "fr": "La chronologie d’épargne supplémentaire ne réinvestit pas les primes privées existantes. La projection séparée des prestations doit être rapprochée ; les deux modèles ne s’additionnent pas.",
    "it": "La cronologia del risparmio aggiuntivo non reinveste i premi privati esistenti. La proiezione separata delle prestazioni va coordinata; i due modelli non si sommano.",
    "en": "The additional-saving timeline does not reinvest existing private premiums. The separate benefit projection must be reconciled; the two models are not added together."
  },
  "assumption.release": {
    "de": "Gebundene Bestände werden zum eingegebenen Nominalbetrag freigegeben; unbekannte vorherige Erträge und Prämien werden nicht erfunden.",
    "fr": "Les avoirs liés sont libérés au montant nominal saisi ; les rendements et primes antérieurs inconnus ne sont pas inventés.",
    "it": "Gli averi vincolati sono liberati al valore nominale inserito; rendimenti e premi precedenti sconosciuti non sono inventati.",
    "en": "Restricted balances are released at the entered nominal amount; unknown earlier returns and premiums are not invented."
  },
  "assumption.predisplay": {
    "de": "Die Projektion beginnt am Bewertungsstichtag, auch wenn die Anzeige erst später einsetzt.",
    "fr": "La projection commence à la date d’évaluation, même si l’affichage débute plus tard.",
    "it": "La proiezione inizia alla data di valutazione, anche se la visualizzazione parte dopo.",
    "en": "Projection starts at the valuation date even if the displayed period starts later."
  },
  "review.income": {
    "de": "Einkommensangaben und Steuerbasis müssen geprüft oder ergänzt werden.",
    "fr": "Les revenus et la base fiscale doivent être vérifiés ou complétés.",
    "it": "Redditi e base fiscale devono essere verificati o completati.",
    "en": "Income inputs and tax basis must be checked or completed."
  },
  "review.capital": {
    "de": "Verfügbarkeit, Bestätigung und Zuordnung des Vermögens müssen geprüft werden.",
    "fr": "La disponibilité, la confirmation et l’affectation des avoirs doivent être vérifiées.",
    "it": "Disponibilità, conferma e assegnazione del patrimonio devono essere verificate.",
    "en": "Availability, confirmation and allocation of assets must be checked."
  },
  "review.provider": {
    "de": "Die Rechnerantwort ist fachlich noch nicht freigegeben.",
    "fr": "La réponse du calculateur n’est pas encore validée par un spécialiste.",
    "it": "La risposta del calcolatore non è ancora validata da uno specialista.",
    "en": "The calculator response has not yet been professionally cleared."
  },
  "review.pension": {
    "de": "PK-Folgen, Bezugsalter und Leistungsannahmen benötigen Fachprüfung.",
    "fr": "Les effets sur la caisse de pension, l’âge de perception et les prestations supposées nécessitent une vérification spécialisée.",
    "it": "Gli effetti sulla cassa pensione, l’età di riscossione e le prestazioni ipotizzate richiedono una verifica specialistica.",
    "en": "Pension-fund effects, benefit ages and benefit assumptions need professional review."
  },
  "review.home": {
    "de": "Die Finanzierung oder die Begünstigung im Eigenheimszenario ist noch zu prüfen.",
    "fr": "Le financement ou les bénéficiaires dans le scénario immobilier restent à vérifier.",
    "it": "Il finanziamento o i beneficiari nello scenario abitativo restano da verificare.",
    "en": "Home-scenario funding or beneficiaries still need review."
  },
  "review.tax": {
    "de": "Steuerpflicht und Begünstigung sind separat zu prüfen; Alternativen werden nicht addiert.",
    "fr": "L’assujettissement fiscal et les bénéficiaires doivent être vérifiés séparément ; les alternatives ne s’additionnent pas.",
    "it": "Assoggettamento fiscale e beneficiari vanno verificati separatamente; le alternative non si sommano.",
    "en": "Tax liability and beneficiary treatment need separate review; alternatives are not added together."
  },
  "review.saving": {
    "de": "Sparbeiträge, bestehende Leistungen und finanzierbarer Spielraum müssen abgestimmt werden.",
    "fr": "Les cotisations d’épargne, prestations existantes et capacité financière doivent être rapprochées.",
    "it": "Contributi di risparmio, prestazioni esistenti e capacità finanziaria devono essere coordinati.",
    "en": "Saving contributions, existing benefits and affordability must be reconciled."
  },
  "error.unauthorized": {
    "de": "Bitte melden Sie sich erneut an.",
    "fr": "Veuillez vous reconnecter.",
    "it": "Effettui nuovamente l’accesso.",
    "en": "Please sign in again."
  },
  "error.forbidden": {
    "de": "Für diesen Schritt fehlt die erforderliche Berechtigung oder Bestätigung.",
    "fr": "L’autorisation ou la confirmation nécessaire manque pour cette étape.",
    "it": "Manca l’autorizzazione o la conferma necessaria per questo passaggio.",
    "en": "The required permission or confirmation is missing for this step."
  },
  "error.notFound": {
    "de": "Der angeforderte Eintrag ist nicht verfügbar.",
    "fr": "L’élément demandé n’est pas disponible.",
    "it": "L’elemento richiesto non è disponibile.",
    "en": "The requested item is not available."
  },
  "error.invalid": {
    "de": "Bitte prüfen und bestätigen Sie Ihre Eingaben.",
    "fr": "Veuillez vérifier et confirmer vos données.",
    "it": "Verifichi e confermi i dati inseriti.",
    "en": "Please check and confirm your inputs."
  },
  "error.stale": {
    "de": "Die Angaben haben sich geändert. Bitte laden Sie den aktuellen Stand.",
    "fr": "Les données ont changé. Veuillez charger la version actuelle.",
    "it": "I dati sono cambiati. Carichi la versione attuale.",
    "en": "The inputs have changed. Please load the current version."
  },
  "error.unavailable": {
    "de": "Der Dienst ist vorübergehend nicht verfügbar. Bitte versuchen Sie es später erneut.",
    "fr": "Le service est momentanément indisponible. Veuillez réessayer plus tard.",
    "it": "Il servizio è temporaneamente non disponibile. Riprovi più tardi.",
    "en": "The service is temporarily unavailable. Please try again later."
  },
  "privacy.title": {
    "de": "Datennutzung vor dem Start",
    "fr": "Utilisation des données avant de commencer",
    "it": "Uso dei dati prima di iniziare",
    "en": "Data use before starting"
  },
  "privacy.purpose": {
    "de": "Dieser Prototyp veranschaulicht Vorsorge- und Lebensversicherungsberatung ausschliesslich mit erfundenen Angaben.",
    "fr": "Ce prototype illustre le conseil en prévoyance et assurance vie uniquement avec des données fictives.",
    "it": "Questo prototipo illustra la consulenza previdenziale e sulla vita solo con dati inventati.",
    "en": "This prototype demonstrates pension and life insurance advice using invented data only."
  },
  "privacy.recipients": {
    "de": "Erfundene Rechendaten werden nach Ihrer Bestätigung an den autorisierten Logismata-Hackathon-Rechner übertragen. Die Vorsorgerechnung ruft keine externen KI-Modelle auf.",
    "fr": "Après votre confirmation, les données de calcul fictives sont transmises au calculateur Logismata autorisé du hackathon. Le calcul de prévoyance n’appelle aucun modèle d’IA externe.",
    "it": "Dopo la conferma, i dati di calcolo inventati sono trasmessi al calcolatore Logismata autorizzato dell’hackathon. Il calcolo previdenziale non chiama modelli di IA esterni.",
    "en": "After your confirmation, invented calculation data is sent to the authorised Logismata hackathon calculator. Pension calculations do not call external AI models."
  },
  "privacy.storage": {
    "de": "Lokale Falldaten werden verschlüsselt gespeichert und nach Löschung oder Fallablauf bereinigt. Bitte geben Sie keine echten Kunden- oder Gesundheitsdaten ein.",
    "fr": "Les données locales du dossier sont chiffrées et supprimées après effacement ou expiration. Ne saisissez aucune donnée réelle de client ou de santé.",
    "it": "I dati locali del caso sono cifrati e rimossi dopo cancellazione o scadenza. Non inserisca dati reali di clienti o sanitari.",
    "en": "Local case data is encrypted and cleaned up after deletion or case expiry. Do not enter real customer or health data."
  },
  "privacy.release": {
    "de": "Verantwortliche und Kontakte für echten Betrieb, Vertragsabschluss und rechtliche Freigaben sind mit Pax noch festzulegen.",
    "fr": "Les responsables et contacts pour l’exploitation réelle, la conclusion et les validations juridiques restent à définir avec Pax.",
    "it": "Responsabili e contatti per l’uso reale, la conclusione e le approvazioni legali restano da definire con Pax.",
    "en": "Controllers and contacts for real operation, contracting and legal approval must still be agreed with Pax."
  },
  "progress.financial": {
    "de": "Finanzielle Ausgangslage",
    "fr": "Situation financière initiale",
    "it": "Situazione finanziaria iniziale",
    "en": "Financial starting position"
  },
  "progress.goals": {
    "de": "Lebensziele",
    "fr": "Objectifs de vie",
    "it": "Obiettivi di vita",
    "en": "Life goals"
  },
  "progress.insurance": {
    "de": "Versicherungsbedarf",
    "fr": "Besoins d’assurance",
    "it": "Fabbisogno assicurativo",
    "en": "Insurance needs"
  },
  "common.quote": {
    "de": "Demo-Konfiguration",
    "fr": "Configuration de démonstration",
    "it": "Configurazione dimostrativa",
    "en": "Demo configuration"
  },
  "common.application": {
    "de": "Demo-Antrag",
    "fr": "Demande de démonstration",
    "it": "Proposta dimostrativa",
    "en": "Demo application"
  },
  "common.policy": {
    "de": "Demo-Police",
    "fr": "Police de démonstration",
    "it": "Polizza dimostrativa",
    "en": "Demo policy"
  },
  "common.timeline": {
    "de": "Pensionierungsphasen",
    "fr": "Phases de retraite",
    "it": "Fasi di pensionamento",
    "en": "Retirement phases"
  },
  "summary.pax_term_life": {
    "de": "Finanzieller Schutz für Hinterbliebene mit ausdrücklich zu prüfender Summe, Laufzeit und Begünstigung.",
    "fr": "Protection financière des survivants, avec montant, durée et bénéficiaires à vérifier.",
    "it": "Protezione finanziaria dei superstiti, con importo, durata e beneficiari da verificare.",
    "en": "Financial protection for survivors, with amount, term and beneficiaries to be reviewed."
  },
  "summary.pax_disability": {
    "de": "Ergänzung bestehender Leistungen bei Erwerbsunfähigkeit; Wartefristen und Bedingungen müssen geprüft werden.",
    "fr": "Complément aux prestations existantes en cas d’incapacité de gain ; délais d’attente et conditions à vérifier.",
    "it": "Integrazione delle prestazioni esistenti in caso di incapacità di guadagno; termini di attesa e condizioni da verificare.",
    "en": "Supplement to existing disability benefits; waiting periods and conditions need review."
  },
  "summary.pax_3a": {
    "de": "Private Vorsorge mit Spar- und Versicherungskomponenten; Berechtigung, Kosten und Eignung sind zu prüfen.",
    "fr": "Prévoyance privée combinant épargne et assurance ; admissibilité, coûts et adéquation à vérifier.",
    "it": "Previdenza privata con componenti di risparmio e assicurazione; ammissibilità, costi e adeguatezza da verificare.",
    "en": "Private provision with saving and insurance components; eligibility, costs and suitability need review."
  },
  "summary.pax_fondsstar": {
    "de": "Fondsgebundene Lebensversicherung mit Anlagerisiken, Kosten und individueller Schutzauswahl.",
    "fr": "Assurance vie liée à des fonds avec risques de placement, coûts et choix individuel de protection.",
    "it": "Assicurazione sulla vita legata a fondi con rischi di investimento, costi e protezione individuale.",
    "en": "Fund-linked life insurance with investment risks, costs and individual cover choices."
  },
  "summary.pax_lifestar": {
    "de": "Kombination aus Vorsorge und Versicherung; die konkrete Ausgestaltung benötigt Beratung.",
    "fr": "Combinaison de prévoyance et d’assurance ; la configuration concrète nécessite un conseil.",
    "it": "Combinazione di previdenza e assicurazione; la configurazione concreta richiede consulenza.",
    "en": "Combination of provision and insurance; the exact configuration needs advice."
  },
  "summary.pax_child": {
    "de": "Sparen und Schutz für ein konkret erfasstes Kind; versicherte Personen und Leistungen sind zu prüfen.",
    "fr": "Épargne et protection pour un enfant identifié ; personnes assurées et prestations à vérifier.",
    "it": "Risparmio e protezione per un figlio identificato; persone assicurate e prestazioni da verificare.",
    "en": "Saving and protection for an identified child; insured persons and benefits need review."
  },
  "summary.pax_payout": {
    "de": "Geplante Auszahlungen aus vorhandenem Kapital mit endlicher Laufzeit und zu prüfender Anlagegestaltung.",
    "fr": "Versements planifiés à partir du capital existant, avec durée limitée et placement à vérifier.",
    "it": "Prelievi pianificati dal capitale esistente, con durata limitata e investimento da verificare.",
    "en": "Planned payouts from existing capital, with a finite term and investment configuration to review."
  },
  "rule.disability_gap_v1": {
    "de": "Diese Option bezieht sich auf die berechnete jährliche Einkommenslücke bei Erwerbsunfähigkeit. Krankheit und Unfall werden als Alternativen betrachtet.",
    "fr": "Cette option répond à la lacune annuelle calculée en cas d’incapacité de gain. Maladie et accident sont des alternatives.",
    "it": "Questa opzione riguarda la lacuna annua calcolata in caso di incapacità di guadagno. Malattia e infortunio sono alternative.",
    "en": "This option addresses the calculated annual disability income gap. Illness and accident are alternative events."
  },
  "rule.survivor_capital_v1": {
    "de": "Der Kapitalbedarf folgt aus der bestätigten Schutzdauer, Einmalkosten, Schuldenbehandlung und bestehenden Mitteln.",
    "fr": "Le besoin de capital découle de la durée confirmée, des frais uniques, du traitement des dettes et des moyens existants.",
    "it": "Il fabbisogno di capitale deriva dalla durata confermata, dai costi una tantum, dal trattamento dei debiti e dai mezzi esistenti.",
    "en": "The capital need follows from the confirmed protection term, one-off costs, debt treatment and existing resources."
  },
  "rule.retirement_saving_gap_v1": {
    "de": "Der Sparvorschlag bezieht sich auf den Vorsorgebedarf und bleibt im erfassten persönlichen Spielraum sowie der verbleibenden 3a-Grenze.",
    "fr": "La proposition d’épargne répond au besoin de prévoyance et reste dans la capacité personnelle saisie et la limite 3a restante.",
    "it": "La proposta di risparmio risponde al fabbisogno previdenziale e resta nella capacità personale registrata e nel limite 3a residuo.",
    "en": "The saving option addresses pension needs within the recorded personal capacity and remaining 3a limit."
  },
  "rule.fund_linked_alternative_v1": {
    "de": "Diese Fondsvariante ist eine Alternative für das erfasste Sparziel; sie ist keine zusätzliche gleichzeitige Verpflichtung. Risiken und Kosten sind zu prüfen.",
    "fr": "Cette variante en fonds est une alternative pour l’objectif d’épargne, pas un engagement supplémentaire simultané. Risques et coûts à vérifier.",
    "it": "Questa variante in fondi è un’alternativa per l’obiettivo di risparmio, non un ulteriore impegno simultaneo. Rischi e costi da verificare.",
    "en": "This fund option is an alternative for the saving goal, not an additional simultaneous commitment. Risks and costs need review."
  },
  "rule.child_goal_v1": {
    "de": "Diese Möglichkeit bezieht sich auf das konkrete Schutzziel und das erfasste Kind; die zahlende erwachsene Person bleibt getrennt.",
    "fr": "Cette possibilité répond à l’objectif de protection et à l’enfant identifié ; l’adulte payeur reste distinct.",
    "it": "Questa possibilità riguarda l’obiettivo di protezione e il figlio identificato; l’adulto pagante resta distinto.",
    "en": "This option relates to the protection goal and identified child; the funding adult remains separate."
  },
  "rule.retirement_drawdown_v1": {
    "de": "Diese Möglichkeit bezieht sich auf geplante Entnahmen aus begrenztem vorhandenem Kapital; sie verspricht keine lebenslange Rente.",
    "fr": "Cette possibilité concerne des prélèvements sur un capital existant limité ; elle ne promet pas de rente viagère.",
    "it": "Questa possibilità riguarda prelievi da capitale esistente limitato; non promette una rendita vitalizia.",
    "en": "This option concerns planned withdrawals from finite existing capital; it does not promise a lifelong pension."
  },
  "status.working": {
    "de": "Erwerbstätig",
    "fr": "En activité",
    "it": "In attività",
    "en": "Working"
  },
  "status.bridge": {
    "de": "Überbrückungsphase",
    "fr": "Phase de transition",
    "it": "Fase di transizione",
    "en": "Bridge period"
  },
  "status.pension": {
    "de": "Rentenbezug",
    "fr": "Perception des rentes",
    "it": "Riscossione delle rendite",
    "en": "Pension benefits"
  },
  "progress.income": {
    "de": "Einkommen",
    "fr": "Revenu",
    "it": "Reddito",
    "en": "Income"
  },
  "progress.budget": {
    "de": "Haushaltsbudget",
    "fr": "Budget du ménage",
    "it": "Bilancio familiare",
    "en": "Household budget"
  },
  "progress.capital": {
    "de": "Vermögen und Zuordnung",
    "fr": "Avoirs et affectation",
    "it": "Patrimonio e assegnazione",
    "en": "Assets and allocations"
  },
  "pillar.1": {
    "de": "Erste Säule: AHV/IV",
    "fr": "Premier pilier : AVS/AI",
    "it": "Primo pilastro: AVS/AI",
    "en": "First pillar: state pension and disability"
  },
  "pillar.2": {
    "de": "Zweite Säule: Pensionskasse",
    "fr": "Deuxième pilier : caisse de pension",
    "it": "Secondo pilastro: cassa pensione",
    "en": "Second pillar: occupational pension"
  },
  "pillar.3": {
    "de": "Dritte Säule: private Vorsorge",
    "fr": "Troisième pilier : prévoyance privée",
    "it": "Terzo pilastro: previdenza privata",
    "en": "Third pillar: private provision"
  },
  "metric.home_remainingUnallocatedCapital": {
    "de": "Übriges freies Kapital",
    "fr": "Capital libre restant",
    "it": "Capitale libero residuo",
    "en": "Remaining free capital"
  },
  "metric.home_protectedReserve": {
    "de": "Geschützte Reserve",
    "fr": "Réserve préservée",
    "it": "Riserva protetta",
    "en": "Protected reserve"
  },
  "error.suitabilityRequired": {"de": "Für dieses Produkt mit Verlustrisiko im Sparprozess braucht es zuerst die Angemessenheitsprüfung.", "fr": "Pour ce produit avec risque de perte dans le processus d’épargne, la vérification du caractère approprié est d’abord nécessaire.", "it": "Per questo prodotto con rischio di perdita nel processo di risparmio occorre prima la verifica dell’adeguatezza.", "en": "This product carries a loss risk in its saving process, so the suitability check comes first."},
  "error.suitabilityAdvisedAgainst": {"de": "Laut Angemessenheitsprüfung passt dieses Produkt nicht zu Ihrem Anlageprofil oder Ihrer Tragbarkeit. Eine Pax-Beratungsperson bespricht mit Ihnen die Möglichkeiten.", "fr": "Selon la vérification du caractère approprié, ce produit ne correspond pas à votre profil d’investissement ou à votre capacité financière. Un·e conseiller·ère Pax discute des possibilités avec vous.", "it": "Secondo la verifica dell’adeguatezza questo prodotto non corrisponde al suo profilo d’investimento o alla sua sostenibilità finanziaria. Un consulente Pax discute con lei le possibilità.", "en": "According to the suitability check this product does not fit your investment profile or what you can afford. A Pax advisor will go through the options with you."},
  "compliance.identification.label": {"de": "Identifikation", "fr": "Identification", "it": "Identificazione", "en": "Identification"},
  "compliance.identification.explanation": {"de": "Bei einem echten Abschluss prüft Pax Ihre Identität mit einem amtlichen Ausweis. In dieser Demo wird kein Ausweis erhoben.", "fr": "Pour une vraie conclusion, Pax vérifie votre identité avec une pièce d’identité officielle. Aucune pièce n’est demandée dans cette démo.", "it": "Per una vera stipulazione Pax verifica la sua identità con un documento ufficiale. In questa demo non viene richiesto alcun documento.", "en": "For a real contract Pax verifies your identity with an official ID. No ID is collected in this demo."},
  "compliance.aml_check.label": {"de": "Geldwäschereiprüfung", "fr": "Contrôle anti-blanchiment", "it": "Controllo antiriciclaggio", "en": "Anti-money-laundering check"},
  "compliance.aml_check.explanation": {"de": "Bei einem echten Abschluss klärt Pax die Herkunft der Mittel und die wirtschaftlich berechtigte Person gemäss Geldwäschereigesetz ab. Diese Demo führt keine solche Prüfung durch.", "fr": "Pour une vraie conclusion, Pax clarifie l’origine des fonds et l’ayant droit économique selon la loi sur le blanchiment d’argent. Cette démo n’effectue pas ce contrôle.", "it": "Per una vera stipulazione Pax chiarisce l’origine dei fondi e l’avente diritto economico secondo la legge sul riciclaggio di denaro. Questa demo non esegue tale controllo.", "en": "For a real contract Pax clarifies the source of funds and the beneficial owner under the Anti-Money Laundering Act. This demo performs no such check."},
  "compliance.health_declaration.label": {"de": "Gesundheitsfragen", "fr": "Questions de santé", "it": "Domande sulla salute", "en": "Health questions"},
  "compliance.health_declaration.explanation": {"de": "Risikoversicherungen brauchen eine Gesundheitsdeklaration, die Pax in einem eigenen geschützten Prozess prüft. Diese Demo erfasst keine Gesundheitsdaten.", "fr": "Les assurances de risque nécessitent une déclaration de santé, examinée par Pax dans un processus protégé séparé. Cette démo ne collecte aucune donnée de santé.", "it": "Le assicurazioni di rischio richiedono una dichiarazione sullo stato di salute, che Pax esamina in un processo protetto separato. Questa demo non raccoglie dati sanitari.", "en": "Risk insurance needs a health declaration that Pax reviews in its own protected process. This demo collects no health data."},
  "compliance.signature.label": {"de": "Unterschrift", "fr": "Signature", "it": "Firma", "en": "Signature"},
  "compliance.signature.explanation": {"de": "Antrag und Angemessenheitsprüfung werden bei einem echten Abschluss rechtsgültig unterschrieben. Die Demo erzeugt keine Unterschrift und keinen Versicherungsschutz.", "fr": "Pour une vraie conclusion, la proposition et la vérification du caractère approprié sont signées valablement. La démo ne crée ni signature ni couverture.", "it": "Per una vera stipulazione la proposta e la verifica dell’adeguatezza vengono firmate validamente. La demo non crea né firma né copertura.", "en": "For a real contract the application and the suitability check are signed legally. The demo creates no signature and no cover."},
} as const;
export type MessageKey=keyof typeof Messages;
export type Locale="de"|"fr"|"it"|"en";
export const Locales:Locale[]=["de","fr","it","en"];
export const languageNumber:Record<Locale,number>={de:1,fr:2,it:3,en:4};
export const intlLocale:Record<Locale,string>={de:"de-CH",fr:"fr-CH",it:"it-CH",en:"en-CH"};
export const t=(locale:Locale,key:MessageKey):string=>Messages[key][locale];

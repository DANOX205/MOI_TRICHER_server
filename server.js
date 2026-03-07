const RoomState = Object.freeze({
    WAITING_PLAYERS: "WAITING_PLAYERS",
    GAME_STARTED: "GAME_STARTED",
    GAME_PAUSED: "GAME_PAUSED",
    GAME_ENDED: "GAME_ENDED"
});

const WebSocket = require("ws");

// Port du serveur
const PORT = 6510;

// Nbr de Joueurs
let Nbr_Joueurs = 0;
let Turn = -1; // Savoir le tour du joueur
const MAX_PLAYERS = 5;
const MAX_CARTES = 10;
let Nbr_Ready = 0;
let roomState = RoomState.WAITING_PLAYERS;
let CurrentCard = 0;
let PreviousCurrentCard = 0;

// Création du serveur WebSocket
const wss = new WebSocket.Server({ port: PORT });

console.log("🟢 Serveur WebSocket lancé sur le port", PORT);

// Variables importantes
let players = {};
let cartes = [];
let listes_echanges = [];
const echangeTimers = new Map(); // clé = "1-3"

// Quand un client se connecte
wss.on("connection", (ws) => {
    // 🔎 Chercher un faux joueur à remplacer
    let slotIndex = findBotIndex(players);
    if (slotIndex != null) { // On doit remplacer le bot.
        console.log("🧑‍💻 Un Client vient de se reconnecter \n");
        NumNouveauJoueur = players[slotIndex].num;
        delete players[slotIndex];
        // Je dois lui envoyer un paquet Game Started
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: "RoomState",
                payload: roomState
            }));
        }
    } else {
        // Aucun bot à remplacer
        if (Nbr_Joueurs ===  0){
            roomState = RoomState.WAITING_PLAYERS;
        }
        console.log("🧑‍💻 Client connecté \n");
        Nbr_Joueurs = Nbr_Joueurs +1;
        NumNouveauJoueur = Nbr_Joueurs;
        console.log("💻 Nbr de Joueurs : " + Nbr_Joueurs + "\n");
        if ((Nbr_Joueurs > MAX_PLAYERS) || (roomState === RoomState.GAME_STARTED)) { 
            console.log("⛔ Connexion refusée : serveur plein");
            Nbr_Joueurs = Nbr_Joueurs - 1;
            console.log("💻 Nbr de Joueurs : " + Nbr_Joueurs + "\n");
            ws.send(JSON.stringify({
                type: "serverFull",
                payload: {
                    message: "Le serveur est plein ou la partie a déjà commencée."
                }
            }));
            ws.close();
            return;
        }
    }
    

    // Quand le serveur reçoit un message
    ws.on("message", (message) => {
        //console.log("📩 Message reçu :", message.toString() + "\n");
        const data = JSON.parse(message);

        if (data.type === "joinRoom") {
            //console.log("📩 Message reçu :", message.toString() + "\n");
            ws.id = Date.now() + Math.random();
            players[ws.id] = {
                id: ws.id,
                is_bot: false,
                num : NumNouveauJoueur,
                username: data.payload.Username,
                teteSkinIndex: data.payload.SkinTeteIndex,
                corpsSkinIndex: data.payload.SkinCorpsIndex,
                emotion: data.payload.Emotion
            };

            // ✅ Message privé au joueur
            //console.log("📩 Message privé envoyé  :", Nbr_Joueurs + "\n");
            ws.send(JSON.stringify({
                type: "welcome",
                payload: {
                    id: ws.id,
                    num: NumNouveauJoueur
                }
            }));
        }

        if (data.type === "playerUpdate") {
            //console.log("📩 Message reçu :", message.toString() + "\n");
            let player = players[ws.id];
            if (!player) {
                console.log("⚠️ Player non trouvé");
            }

            player.NUM = data.payload.NUM;
            player.skinTeteIndex = data.payload.SkinTeteIndex;
            player.skinCorpsIndex = data.payload.SkinCorpsIndex;
            player.playerName = data.payload.Username;
            player.emotion = data.payload.Emotion;
            player.Looking_Down = data.payload.Looking_Down;

            broadcastPlayers();
        }

        if (data.type === "GameInfo"){
            broadcastUpdateGame();
        }

        if (data.type === "ReadyOrNot") {
            if (data.payload){
                Nbr_Ready = Nbr_Ready +1;
            }  else if (Nbr_Ready > 0) {
                Nbr_Ready = Nbr_Ready -1;
            }

            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({
                        type: "NbrReady",
                        payload: Nbr_Ready
                    }));
                }
            });
            if ((Nbr_Joueurs > 1) && (Nbr_Ready === Nbr_Joueurs)){
                Turn = Math.floor((Math.random() * (Nbr_Joueurs - 1)) + 1);
                console.log("C'est au tour de : " + Turn);
                roomState = RoomState.GAME_STARTED;
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: "RoomState",
                            payload: roomState
                        }));
                    }
                });

                let cartes_available = [];
                for (let i = 1; i <= 52; i++){
                    cartes_available.push(i);
                }
                for (let i = cartes_available.length - 1; i > 0; i--) { // On mélange
                    const j = Math.floor(Math.random() * (i + 1));
                    [cartes_available[i], cartes_available[j]] = [cartes_available[j], cartes_available[i]];
                }

                for (const id in players) {
                    cartes.push({
                        id: id,
                        num: players[id].num,
                        cartes_joueur: []
                    });
                }
                for (let i = 0; i < 7; i++) { // Distribuer les 7 cartes à chaque Joueur
                    cartes.forEach(joueur => {
                        joueur.cartes_joueur.push({
                            Valeur : cartes_available.pop(),
                            Seen :false ,
                            Echange : false});
                    });
                }

                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: "GAME_START",
                            payload: cartes
                        }));
                    }
                });
            }
        }

        if (data.type === "EchangeUpdate"){
            broadcastEchanges();
        }

        if (data.type === "playerProposeEchange"){
            // console.log("🔄 Echange Proposé :", message.toString() + "\n");
            const p = data.payload;
            const echange = getOrCreateEchange(p.Source, p.Destination);
            //Si le joueur envoie un CANCEL
            if (p.EchangePropose === false) {
                // console.log("❌ Cancel reçu → reset complet");
                resetEchange(echange); 
                broadcastCancel();
                return;
            }
            // 🔥 On identifie qui parle
            const isSource = p.playerNum === echange.Source;
            if (isSource) {
                echange.carteSource = p.Carte;
                echange.EchangeProposeSource = p.EchangePropose;
                echange.AccepteSource = p.Accepte;
            } else {
                echange.carteDestination = p.Carte;
                echange.EchangeProposeDestination = p.EchangePropose;
                echange.AccepteDestination = p.Accepte;
            }
            // 🎯 Si au moins un propose → timer démarre
            if (echange.EchangeProposeSource || echange.EchangeProposeDestination) {
                startEchangeTimer(echange);
            } else {
                stopEchange(echange);
            }
            // 🎯 Si les deux acceptent
            if (echange.AccepteSource && echange.AccepteDestination) {
                // console.log("ECHANGE VALIDÉ");
                stopEchange(echange);
                // Ici le vrai swap de cartes
                swapCartes(echange);
                resetEchange(echange); 
                broadcastCancel();
            }
            broadcastEchanges();
        }
        
  });

  // Quand le client se déconnecte
  ws.on("close", () => {
    const slot = ws.id;
    if (roomState === RoomState.GAME_STARTED){
        // La partie a déjà commencée, on remplace le joueur par un 'faux' joueur nommé déconnecté
        players[slot].is_bot = true;
        players[slot].skinTeteIndex = 0;
        players[slot].skinCorpsIndex = 0;
        players[slot].playerName = "Déconnecté";
        players[slot].emotion = 0;
        players[slot].Looking_Down = false;
        console.log("🤖 Joueur remplacé par un faux joueur");
        ws.emit("updatePlayers", players);
    } else {
        console.log("❌ Client déconnecté");
        Nbr_Joueurs = Nbr_Joueurs -1;
        Nbr_Ready = 0;
        console.log("💻 Nbr de Joueurs : " + Nbr_Joueurs + "\n");
        delete players[slot];
        ws.emit("updatePlayers", players);
    }
  });
});

function broadcastUpdateGame(){
    const payload = {
        Turn: Turn,
        CurrentCard: CurrentCard,
        PreviousCurrentCard : PreviousCurrentCard,
        Cartes : cartes
    };

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: "gameUpdate",
                payload: payload
            }));
        }
    });
}


function broadcastPlayers() {
    //console.log("Broadcast envoyé à", wss.clients.size, "clients");
    const payload = {
        players: players,
        playerCount: Object.keys(players).length,
        playerCountReady: Nbr_Ready
    };

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: "worldUpdate",
                payload: payload
            }));
        }
    });
}

function findBotIndex(players) {
    return Object.keys(players).find(id => players[id].is_bot);
}

function getKey(a, b) {
    return [Math.min(a,b), Math.max(a,b)].join("-");
}

function resetEchange(echange) {
    const key = getKey(echange.Source, echange.Destination);
    stopEchange(echange);
    echange.carteSource = null;
    echange.carteDestination = null;

    echange.EchangeProposeSource = false;
    echange.EchangeProposeDestination = false;

    echange.AccepteSource = false;
    echange.AccepteDestination = false;

    echange.TimerValue = 0;
}

function getEchange(payload){
    for (let i= 0;i< listes_echanges.length;i++){
        if ((listes_echanges[i].Source === payload.Source) && (listes_echanges[i].Destination === payload.Destination)){
            return listes_echanges[i];
        }
    }
}

function findPlayerByNum(num) {
    return cartes.find(j => j.num === num);
}

function swapCartes(echange) {
    const joueurSource = findPlayerByNum(echange.Source);
    const joueurDestination = findPlayerByNum(echange.Destination);

    if (!joueurSource || !joueurDestination) {
        console.log("Erreur swap : joueur introuvable");
        return;
    }

    // 🔎 Trouver les cartes
    const indexSource = joueurSource.cartes_joueur.findIndex(
        c => c.Valeur === echange.carteSource
    );

    const indexDestination = joueurDestination.cartes_joueur.findIndex(
        c => c.Valeur === echange.carteDestination
    );

    if (indexSource === -1 || indexDestination === -1) {
        console.log("Erreur swap : carte introuvable");
        return;
    }

    // 🎯 Récupération des cartes
    const carteS = joueurSource.cartes_joueur[indexSource];
    const carteD = joueurDestination.cartes_joueur[indexDestination];

    // 🔄 Swap
    joueurSource.cartes_joueur[indexSource] = carteD;
    joueurDestination.cartes_joueur[indexDestination] = carteS;

    // 🔥 Reset flags échange
    joueurSource.cartes_joueur[indexSource].Echange = false;
    joueurDestination.cartes_joueur[indexDestination].Echange = false;

    // console.log("Cartes échangées avec succès !");
}

function getOrCreateEchange(source, destination) {
    const key = getKey(source, destination);
    let echange = listes_echanges.find(e =>
        getKey(e.Source, e.Destination) === key
    );
    if (!echange) {
        echange = {
            Source: Math.min(source, destination),
            Destination: Math.max(source, destination),

            carteSource: null,
            carteDestination: null,

            EchangeProposeSource: false,
            EchangeProposeDestination: false,

            AccepteSource: false,
            AccepteDestination: false,

            TimerValue: 0
        };
        listes_echanges.push(echange);
    }
    return echange;
}

function startEchangeTimer(echange) {
    const key = getKey(echange.Source, echange.Destination);
    if (echangeTimers.has(key)) return; // empêche double timer
    echange.TimerValue = 0;
    const interval = setInterval(() => {
        echange.TimerValue++;
        broadcastEchanges();
        if (echange.TimerValue >= 42) {
            stopEchange(echange);
            resetEchange(echange);
            broadcastCancel();
        }
    }, 1000);
    echangeTimers.set(key, interval);
}

function stopEchange(echange) {
    console.log("Echange annulé !");
    const key = getKey(echange.Source, echange.Destination);
    const interval = echangeTimers.get(key);
    if (interval) {
        clearInterval(interval);
        echangeTimers.delete(key);
    }
    echange.EchangePropose = false;
    echange.Accepte1 = false;
    echange.Accepte2 = false;
    echange.TimerValue = 0;
    broadcastEchanges();
}

function Both_Accept(echange) {
    return echange.Accepte1 && echange.Accepte2;
}

function broadcastEchanges() {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: "EchangeUpdate",
                payload: listes_echanges
            }));
        }
    });
}

function broadcastCancel(){
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: "CancelEchange",
                payload: listes_echanges
            }));
        }
    });
}
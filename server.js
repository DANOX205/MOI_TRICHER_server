const RoomState = Object.freeze({
    WAITING_PLAYERS: "WAITING_PLAYERS",
    GAME_STARTED: "GAME_STARTED",
    GAME_PAUSED: "GAME_PAUSED",
    GAME_ENDED: "GAME_ENDED"
});

const WebSocket = require("ws");

// Port du serveur
const PORT = process.env.PORT || 6510;

// Timer
let ACTIVATE_Timer = false; // false
let Timer_speed = 2000;
let Timer_index = 0; 
let Timer_interval = null;

// Power 
let special_card_power = [];
special_card_power.push({
    playernum : 0,
    power : 0
});

// Nbr de Joueurs
let Nbr_Joueurs = 0;
let Turn = -1; // Savoir le tour du joueur
let TurnRegistered = -1;
const MAX_PLAYERS = 5;
const MAX_CARTES = 10;
let Nbr_Ready = 0;
let roomState = RoomState.WAITING_PLAYERS;
let CurrentCard = 0; // 0
let PreviousCurrentCard = 0;
let Players_that_cant_play = 0;
let WINNER = 0;

// Gestion de la triche 
let Nbr_Triche = 0;
let Triche_allowed = false;
const cheatingTimers = {};

// Création du serveur WebSocket
const wss = new WebSocket.Server({ port: PORT });

console.log("🟢 Serveur WebSocket lancé sur le port", PORT);

// Variables importantes
let players = {};
let cartes = [];
let cartes_available = [];
let listes_echanges = [];
const echangeTimers = new Map(); // clé = "1-3"

// Quand un client se connecte
wss.on("connection", (ws) => {
    // 🔎 Chercher un faux joueur à remplacer
    let slotIndex = findBotIndex(players);
    if (slotIndex != null) { // On doit remplacer le bot.
        console.log("🧑‍💻 Un Client vient de se reconnecter \n");
        console.log("Menottes : " + players[slotIndex].Menottes);
        console.log("Lunettes : " + players[slotIndex].Lunettes);
        console.log("Objet1 : " + players[slotIndex].Object1);
        console.log("Objet2 : " + players[slotIndex].Object2);
        console.log("Objet3 : " + players[slotIndex].Object3);
        NumNouveauJoueur = players[slotIndex].num;
        MenottesNouveauJoueur = players[slotIndex].Menottes;
        LunettesNouveauJoueur = players[slotIndex].Lunettes;
        Object1NouveauJoueur = players[slotIndex].Object1;
        Object2NouveauJoueur = players[slotIndex].Object2;
        Object3NouveauJoueur = players[slotIndex].Object3;
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
        MenottesNouveauJoueur = false;
        LunettesNouveauJoueur = false;
        Object1NouveauJoueur = 0;
        Object2NouveauJoueur = 0;
        Object3NouveauJoueur = 0;
        console.log("💻 Nbr de Joueurs : " + Nbr_Joueurs + "\n");
        if ((Nbr_Joueurs > MAX_PLAYERS) || (roomState === RoomState.GAME_STARTED) || (roomState === RoomState.GAME_ENDED)) { 
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
                emotion: data.payload.Emotion,
                triche: data.payload.Triche,
                Cheating_Timer_index : -1,
                Menottes : MenottesNouveauJoueur,
                Lunettes : LunettesNouveauJoueur,
                Object1 : Object1NouveauJoueur,
                Object2 : Object2NouveauJoueur,
                Object3 : Object3NouveauJoueur
            };
            if (data.payload.Triche){
                Nbr_Triche = Nbr_Triche + 1;
            }

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

        if (data.type === "AskRoomstate"){
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: "RoomState",
                    payload: roomState
                }));
            }
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
            player.Sweating_Index = data.payload.Sweating_Index;

            broadcastPlayers();
        }

        if (data.type === "playerUpdate_END") {
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
            player.Sweating_Index = data.payload.Sweating_Index;

            broadcastPlayers_END();
        }        

        if (data.type === "GameInfo"){
            broadcastUpdateGame();
            /*if (Triche_allowed) {
                broadcastUpdateObjects();
            }*/
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
                if (Nbr_Triche >= Nbr_Joueurs/2){
                    Triche_allowed = true;
                } else {
                    Triche_allowed = false;
                }
                console.log("La partie peut commencer ! \n");
                console.log("NbrTriche/NbrJoueurs : " + Nbr_Triche + "/" + Nbr_Joueurs + "// Triche autorisée : " + Triche_allowed);
                Turn = Math.floor((Math.random() * (Nbr_Joueurs - 1)) + 1);
                console.log("C'est au tour de : " + Turn);
                roomState = RoomState.GAME_STARTED;

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

                const payload = {
                    cartes : cartes,
                    Triche_allowed : Triche_allowed
                };

                for (const id in players) {
                    chooseItems(players[id].num);
                }

                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: "GAME_START",
                            payload: payload
                        }));
                    }
                });

                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: "RoomState",
                            payload: roomState
                        }));
                    }
                });
                if (ACTIVATE_Timer){
                    startTimer(true);
                }
            }
        }

        if (data.type === "JePioche") {
            console.log("⛏️ Le joueur :" + data.payload + "doit piocher.");
            Players_that_cant_play += 1;
            const joueur = findPlayerByNum(data.payload);
            stopTimer();
            piocherCarte(joueur, true, Turn);
            Turn = -1;
            Timer_index = 0;
            if (Players_that_cant_play == (Nbr_Joueurs-1)){
                Players_that_cant_play = 0;
                // Retirer la carte courante et mettre une carte nulle.
                PreviousCurrentCard = CurrentCard;
                CurrentCard = 0;
            }
        }

        if (data.type === "CardPlayed") {
            const joueur = findPlayerByNum(data.payload.playerNum);
            PrintCarte(data.payload.Valeur, data.payload.playerNum);
            special_card_power[0].power = 0;
            Players_that_cant_play = 0;
            if (CanPlayCard(data.payload.IsComboing, data.payload.Valeur, data.payload.OtherValeur)){
                ActionAfterPlay(joueur,data.payload.IsComboing, data.payload.Valeur, data.payload.OtherValeur);
            }
            if (isGameOver()){
                roomState = RoomState.GAME_ENDED;
                broadcastEndGame();
            }
        }

        if (data.type === "specialPowerCard"){
            console.log("Je joueur n°" + data.payload.playerNum + " a sa carte " + data.payload.Carte + " en seen."); //ASUP
            special_card_power[0].power = 0;
            const joueur = findPlayerByNum(data.payload.playerNum);
            if (data.payload.power === 2){ // C'est une reine 
                // Ajouter une Cartes au joueur
                piocherCarte(joueur, true, TurnRegistered);
            } else if (data.payload.power === 1){ // C'est un Valet 
                // Trouver la carte
                let carteIndex = joueur.cartes_joueur.findIndex(carte => carte.Valeur === data.payload.Carte);
                // La passer en Seen vrai
                joueur.cartes_joueur[carteIndex].Seen = true;
                Turn = NextPlayerTurn(TurnRegistered);
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

        if (data.type === "Reset"){
            if (roomState != RoomState.WAITING_PLAYERS){
                resetServer();
            }
        }

        if (data.type === "UNLOCK"){
            console.log("🔑 Tu es libre !");
            let player = findPlayerByNum_players(data.payload);
            player.Menottes = false;
            broadcastUnlock(data.payload);
        }

        if (data.type === "CHEATING"){
            if (roomState === RoomState.GAME_STARTED){
                switch (data.payload.ObjectID){
                    case 1 : // C'est un Ciseau
                        console.log("✂️ TRICHE : Ciseaux en action !");
                        if (CurrentCard === PreviousCurrentCard){
                            broadcastCheatingAnimation(data.payload.Source,-1,-1, null);
                        } else {
                            CurrentCard = PreviousCurrentCard;
                            broadcastCheatingAnimation(data.payload.Source,-1,1, null);
                            removeItem(data.payload.Source,data.payload.ObjectID);
                            startCheatingTimer(data.payload.Source);
                        }
                        break;
                    case 2 : // C'est une Batte 
                        console.log("🏏 TRICHE : Batte en action !");
                        const player = findPlayerByNum_players(data.payload.Destination);
                        const cartes = findPlayerByNum(data.payload.Destination);
                        console.log("payload :" + data.payload.Destination);
                        console.log("Cheating_Timer_index :" + player.Cheating_Timer_index);
                        if (player.Cheating_Timer_index != -1){
                            // Le joueur a triché ! Il pioche deux cartes.
                            broadcastCheatingAnimation(data.payload.Source,data.payload.Destination,2, null);
                            removeItem(data.payload.Source,data.payload.ObjectID);
                            piocherCarte(cartes, false, -1);
                            piocherCarte(cartes, false, -1);
                            stopCheating(data.payload.Destination);
                        } else {
                            broadcastCheatingAnimation(data.payload.Source,-1,2, null);
                        }
                        break;
                    case 3 : // C'est une Canne
                        console.log("🎣 TRICHE : Canne à pêche en action !");
                        if ((search_card(data.payload.Source, data.payload.Carte)) && (playerhaslessthan2Cards(data.payload.Source, data.payload.Destination))) { // Est-ce que la carte est dans le jeu du Joueur ? 
                            broadcastCheatingAnimation(data.payload.Source,data.payload.Destination,3, null);
                            removeItem(data.payload.Source,data.payload.ObjectID);
                            giveCardtoAnotherPlayer(data.payload.Source,data.payload.Destination,data.payload.Carte);
                            startCheatingTimer(data.payload.Source);
                        } else {
                            console.log("❌ Carte introuvable");
                            broadcastCheatingAnimation(data.payload.Source,-1,-1, null);
                        }
                        break;
                    case 4 : // C'est un Téléphone 
                        console.log("📱 TRICHE : Téléphone en action !");
                        broadcastCheatingAnimation(data.payload.Source,data.payload.Destination,4,data.payload.Message);
                        startCheatingHalfTimer(data.payload.Source);
                        break;
                    case 5 : // C'est un Crayon 

                    case 6 : // Ce sont des Menottes
                        console.log("🔗 TRICHE : Menottes en action !");
                        let playerA = findPlayerByNum_players(data.payload.Destination);
                        playerA.Menottes = true;
                        broadcastCheatingAnimation(data.payload.Source,data.payload.Destination,6, null);
                        removeItem(data.payload.Source,data.payload.ObjectID);
                        startCheatingTimer(data.payload.Source);
                        break;
                    case 7 : // Ce sont des Lunettes
                        console.log("🕶️ TRICHE : Lunettes en action !");
                        let playerB = findPlayerByNum_players(data.payload.Destination);
                        playerB.Lunettes = true;
                        broadcastCheatingAnimation(data.payload.Source,data.payload.Destination,7, null);
                        removeItem(data.payload.Source,data.payload.ObjectID);
                        startCheatingTimer(data.payload.Source);
                        break;
                    case 8: // C'est le 4x4
                        console.log("🛻 TRICHE : 4x4 en action !");
                        if (check4x4(data.payload.Source)){
                            broadcastCheatingAnimation(data.payload.Source,-1,8, null);
                            removeItem(data.payload.Source,data.payload.ObjectID);
                            this.Turn = -1;
                            setTimeout(() => {
                                WINNER = data.payload.Source;
                                roomState = RoomState.GAME_ENDED;
                                broadcastEndGame();
                            },2500);
                        } else {
                            broadcastCheatingAnimation(data.payload.Source,-1,-1, null);
                        }
                }
            } else {
                console.log("⚠️ IMPOSSIBLE DE TRICHER SI LA PARTIE N'A PAS COMMENCEE !");
                broadcastCheatingAnimation(data.payload.Source,-1,-1, null);
            }
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
        if (players[slot].triche) {
            Nbr_Triche = Nbr_Triche - 1;
        }
        Nbr_Joueurs = Nbr_Joueurs -1;
        Nbr_Ready = 0;
        console.log("💻 Nbr de Joueurs : " + Nbr_Joueurs + "\n");
        delete players[slot];
        ws.emit("updatePlayers", players);
    }
  });
});

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

function isGameOver(){
    for (const joueur of cartes) {
        if (joueur.cartes_joueur.length === 0) {
            WINNER = joueur.num;
            console.log("🏆 Joueur gagnant :", WINNER);
            return true;
        }
    }
    return false;
}

function chooseItems(playerNum){
    let joueur = findPlayerByNum_players(playerNum);
    let items_list = [1,2,3,4,6,7,8];
    joueur.Object1 = items_list.splice(Math.floor(Math.random() * items_list.length),1)[0];
    joueur.Object2 = items_list.splice(Math.floor(Math.random() * items_list.length),1)[0];
    joueur.Object3 = items_list.splice(Math.floor(Math.random() * items_list.length),1)[0];
    return [joueur.Object1,joueur.Object2,joueur.Object3];
}

function removeItem(playerNum, ItemID){
    const joueur = findPlayerByNum_players(playerNum);
    if (joueur.Object1 === ItemID){
        joueur.Object1 = 0;
    } else if (joueur.Object2 === ItemID) {
        joueur.Object2 = 0;
    } else if (joueur.Object3 === ItemID) {
        joueur.Object3 = 0;
    } else {
        console.log("❌ Impossible de retirer l'objet.");
    }
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

function findPlayerByNum_players(num) {
    return Object.values(players).find(player => player.num === num);
}

function CanPlayCard(isCombo, Carte1, Carte2){
    if (isCombo){
        if (findValueCombo(Carte1, Carte2) === 0){
            return false;
        } else {
            return true;
        }
    } else {
        const val = Carte1 % 13;
        if ((val === 0) || (val === 11) || (val === 12)){ // C'est un Valet, une reine ou un Roi
            return true;
        } else {
            if (val >= Turn){
                return true;
            } else {
                return false;
            }
        }

    }
}

function ActionAfterPlay(joueur,isComboing, Valeur, OtherValeur){
    if (isComboing) { // C'est une carte Combo
        if (OtherValeur != null){
            PreviousCurrentCard = CurrentCard;
            console.log("🃏🃏 C'est une carte COMBO !!");
            CardPlayed(joueur, Valeur);
            CardPlayed(joueur, OtherValeur);
            let new_Valeur = findValueCombo(Valeur, OtherValeur);
            console.log("Valeur 1 : " + Valeur + "// OtherValeur" + OtherValeur + "// new_Val" + new_Valeur);
            WaitAndUpdate(new_Valeur, Turn, false, false);
            Turn = -1;
        } else {
            console.log("🃏🃏 PB Impossible de COMBO !!");
        }
    } else { // C'est une carte Classique 
        CardPlayed(joueur, Valeur);
        PreviousCurrentCard = CurrentCard;
        if (Valeur % 13 === 0) { 
            console.log("🃏 C'est un roi !!");
            TurnRegistered = Turn;
            if (special_card_power[0].power == 3) {
                WaitAndUpdate(Valeur, Turn, false, false);
            } else {
                WaitAndUpdate(Valeur, Turn, true, true);
            }
            special_card_power[0].playernum = joueur.num;
            special_card_power[0].power = 3;
        } else if (Valeur % 13 === 12) { 
            console.log("🃏 C'est une reine !!");
            special_card_power[0].playernum = joueur.num;
            special_card_power[0].power = 2;
            TurnRegistered = Turn;
            WaitAndUpdate(Valeur, Turn, false, true);
            // Recommencer le Timer et attendre la réponse du Joueur
        } else if (Valeur % 13 === 11) { 
            console.log("🃏 C'est un valet !!");
            special_card_power[0].playernum = joueur.num;
            special_card_power[0].power = 1;
            TurnRegistered = Turn;
            WaitAndUpdate(Valeur, Turn, false, true);
            // Recommencer le Timer et attendre la réponse du Joueur
        } else {
            console.log("🃏 C'est une carte classique !!");
            special_card_power[0].playernum = joueur.num;
            special_card_power[0].power = 0;
            WaitAndUpdate(Valeur, Turn, false, false);
        }
        console.log(special_card_power);
        Turn = -1;
    }
}

function CardPlayed(joueur, valeur){
    // Ajouter la carte sous la pile
    cartes_available.unshift(valeur);
    // Supprimer la carte de la main du joueur
    joueur.cartes_joueur = joueur.cartes_joueur.filter(carte => carte.Valeur !== valeur);
    // Envoyer un paquet Animation Card Played
    broadcastCardPlayed(joueur.num);
}

function search_card(playerNum, valeur) {
    const joueur = findPlayerByNum(playerNum);
    return joueur.cartes_joueur.find(carte => carte.Valeur === valeur);
}

function check4x4(playerNum) {
    const joueur = findPlayerByNum(playerNum);
    if (!joueur) {
        return false;
    }
    const valeurs = joueur.cartes_joueur.map(carte => carte.Valeur);
    return (
        valeurs.includes(4) &&
        valeurs.includes(17) &&
        valeurs.includes(30) &&
        valeurs.includes(43)
    );
}

function playerhaslessthan2Cards(playerNum, playerNumDestination){
    const joueurA = findPlayerByNum(playerNum);
    const joueurB = findPlayerByNum(playerNumDestination);
    let bool1 = (joueurA.cartes_joueur.length>2)?true:false;
    let bool2 = (joueurB.cartes_joueur.length<9)?true:false;
    return (bool1 && bool2);
}

function giveCardtoAnotherPlayer(source,destination,valeur) {
    const joueurA = findPlayerByNum(source);
    const joueurB = findPlayerByNum(destination);
    // Supprimer la carte de la main du joueur
    joueurA.cartes_joueur = joueurA.cartes_joueur.filter(carte => carte.Valeur !== valeur);
    // Donner la carte après 3 secondes
    setTimeout(() => {
        if (joueurB.cartes_joueur.length<9){
            joueurB.cartes_joueur.push({
                Valeur : valeur,
                Seen :false ,
                Echange : false});;
            broadcastPlayers();
            console.log(
                `🎣 Carte ${valeur} transférée du joueur ${source} au joueur ${destination}`
            );
        } else {
            console.log(
                `🎣 Transfert de carte annulé`
            );
        }
    }, 3000);
}

function WaitAndUpdate(Next_CurrentCard, Next_Turn, isKing, isQueenOrJack){
    let interval_index = 0;
    let interval = setInterval(() => {
        interval_index++;
        if (interval_index > 5){
            clearInterval(interval);
            CurrentCard = Next_CurrentCard;
            console.log ("Current_Card : " + CurrentCard%13);
            if (isKing){
                Turn = Next_Turn;
            } else if (!isQueenOrJack) {
                Turn = NextPlayerTurn(Next_Turn);
                special_card_power[0].power = 0;
            }
            if (ACTIVATE_Timer){
                resetTimer();
                startTimer(!isQueenOrJack);
            }
        }
    }, 250);
}

function piocherCarte(joueur, bool, Next_Turn){
    let pioche = true;
    if ((!cartes_available) || (cartes_available.length === 0)) {
        console.log("❌ Plus de cartes disponibles !");
        pioche = false;
    }
    if (joueur.cartes_joueur.length >= 10){
        console.log("❌ Le joueur ne peut plus recevoir de cartes !");
        pioche = false;
    }
    if (pioche) {
        broadcastPioche(joueur.num);
    }
    let interval_index = 0;
    let interval = setInterval(() => {
        interval_index++;
        if (interval_index > 2){
            clearInterval(interval);
            if (pioche){
                joueur.cartes_joueur.push({
                    Valeur : cartes_available.pop(),
                    Seen :false ,
                    Echange : false
                });
            }
            if (bool){
                Turn = NextPlayerTurn(Next_Turn);
                if (ACTIVATE_Timer){
                    resetTimer();
                    startTimer(true);
                }
            }
        }
    }, 500);
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

function NextPlayerTurn(Next_Turn) {
    return ((Next_Turn) % (Nbr_Joueurs)) + 1;
}

function startTimer(pioche) {
    Timer_interval = setInterval(() => {
        Timer_index++;
        broadcastUpdateTimer();
        if (Timer_index >= 24) {
            stopTimer();
            if (pioche) {
                const joueur = findPlayerByNum(Turn);
                piocherCarte(joueur, true, Turn);
                Turn = -1;
            } else {
                // Passer au tour suivant
                Turn = NextPlayerTurn(TurnRegistered);
                if (ACTIVATE_Timer){
                    resetTimer();
                    startTimer(true);
                }
            }
            Timer_index = 0;
        }
    }, Timer_speed);
}

function stopTimer() {
    if (Timer_interval) {
        clearInterval(Timer_interval);
    }
}

function resetTimer() {
    Timer_index = 0;
    if (Timer_interval) {
        clearInterval(Timer_interval);
    }
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

function startCheatingTimer(num) {
    const player = findPlayerByNum_players(num);
    if (!player) return;
    // Si un timer existe déjà pour ce joueur
    stopCheating(num);
    player.Cheating_Timer_index = 0;
    broadcastTimerValue(num, 0);
    cheatingTimers[num] = setInterval(() => {
        player.Cheating_Timer_index++;
        broadcastTimerValue(num, player.Cheating_Timer_index);
        if (player.Cheating_Timer_index >= 10) {
            stopCheating(num);
        }
    }, 1000);
}

function startCheatingHalfTimer(num) {
    const player = findPlayerByNum_players(num);
    if (!player) return;
    // Si un timer existe déjà pour ce joueur
    if ((player.Cheating_Timer_index > 5) || (player.Cheating_Timer_index === -1)){
        stopCheating(num);
        player.Cheating_Timer_index = 5;
        broadcastTimerValue(num, 5);
        cheatingTimers[num] = setInterval(() => {
            player.Cheating_Timer_index++;
            broadcastTimerValue(num, player.Cheating_Timer_index);
            if (player.Cheating_Timer_index >= 10) {
                stopCheating(num);
            }
        }, 1000);
    }
}

function stopCheating(num) {
    const player = findPlayerByNum_players(num);
    if (!player) return;
    if (cheatingTimers[num]) {
        clearInterval(cheatingTimers[num]);
        delete cheatingTimers[num];
    }
    player.Cheating_Timer_index = -1;
    broadcastTimerValue(num, -1);
}

function resetServer(){
    Timer_index = 0; 
    Timer_interval = null;

    // Nbr de Joueurs
    Turn = -1; // Savoir le tour du joueur
    TurnRegistered = -1;
    Nbr_Ready = 0;
    roomState = RoomState.WAITING_PLAYERS;
    CurrentCard = 0; // 0
    PreviousCurrentCard = 0;
    Players_that_cant_play = 0;
    WINNER = 0;

    // Power 
    special_card_power = [];
    special_card_power.push({
        playernum : 0,
        power : 0
    });
    cartes = [];
    cartes_available = [];
    listes_echanges = [];
}

// ---------------------------------------------------
// AFFICHAGE
// ---------------------------------------------------

function PrintCarte(carte, numJoueur) {
    let val = (carte%13);
    if (val == 0) {
        val = "ROI";
    } else if (val == 12){
        val = "REINE";
    } else if (val == 11){
        val = "VALET";
    }
    let string = "carte non reconnue !";
    if (carte < 14){
        string = "a joué la carte : " + val + " de ♥️";
    } else if (carte < 27){
        string = "a joué la carte : " + val + " de ♠️";
    } else if (carte < 40){
        string = "a joué la carte : " + val + " de ♦️";
    } else {
        string = "a joué la carte : " + val + " de ♣️";
    }
    console.log("🃏 Le joueur n°" + numJoueur + " a joué la carte : " + string);
}

function findValueCombo(value1, value2){   
    // 1
    if (((value1 == 1) && (value2 == 14)) || ((value2 == 1) && (value1 == 14))) { // 1 ♥️ + 1 ♠️
        return 53+1;
    }
    if (((value1 == 1) && (value2 == 27)) || ((value2 == 1) && (value1 == 27))) { // 1 ♥️ + 1 ♦️
        return 54+1;
    }
    if (((value1 == 1) && (value2 == 40)) || ((value2 == 1) && (value1 == 40))) { // 1 ♥️ + 1 ♣️
        return 55+1;
    }
    if (((value1 == 14) && (value2 == 27)) || ((value2 == 14) && (value1 == 27))) { // 1 ♠️ + 1 ♦️
        return 56+1;
    }
    if (((value1 == 14) && (value2 == 40)) || ((value2 == 14) && (value1 == 40))) { // 1 ♠️ + 1 ♣️
        return 57+1;
    }
    if (((value1 == 27) && (value2 == 40)) || ((value2 == 27) && (value1 == 40))) { // 1 ♦️ + 1 ♣️
        return 58+1;
    }
    // 2
    if (((value1 == 2) && (value2 == 15)) || ((value2 == 2) && (value1 == 15))) { // 2 ♥️ + 2 ♠️
        return 59+1;
    }
    if (((value1 == 2) && (value2 == 28)) || ((value2 == 2) && (value1 == 28))) { // 2 ♥️ + 2 ♦️
        return 60+1;
    }
    if (((value1 == 2) && (value2 == 41)) || ((value2 == 2) && (value1 == 41))) { // 2 ♥️ + 2 ♣️
        return 61+1;
    }
    if (((value1 == 15) && (value2 == 28)) || ((value2 == 15) && (value1 == 28))) { // 2 ♠️ + 2 ♦️
        return 62+1;
    }
    if (((value1 == 15) && (value2 == 41)) || ((value2 == 15) && (value1 == 41))) { // 2 ♠️ + 2 ♣️
        return 63+1;
    }
    if (((value1 == 28) && (value2 == 41)) || ((value2 == 28) && (value1 == 41))) { // 2 ♦️ + 2 ♣️
        return 64+1;
    }
    // 3
    if (((value1 == 3) && (value2 == 16)) || ((value2 == 3) && (value1 == 16))) { // 3 ♥️ + 3 ♠️
        return 65+1;
    }
    if (((value1 == 3) && (value2 == 29)) || ((value2 == 3) && (value1 == 29))) { // 3 ♥️ + 3 ♦️
        return 66+1;
    }
    if (((value1 == 3) && (value2 == 42)) || ((value2 == 3) && (value1 == 42))) { // 3 ♥️ + 3 ♣️
        return 67+1;
    }
    if (((value1 == 16) && (value2 == 29)) || ((value2 == 16) && (value1 == 29))) { // 3 ♠️ + 3 ♦️
        return 68+1;
    }
    if (((value1 == 16) && (value2 == 42)) || ((value2 == 16) && (value1 == 42))) { // 3 ♠️ + 3 ♣️
        return 69+1;
    }
    if (((value1 == 29) && (value2 == 42)) || ((value2 == 29) && (value1 == 42))) { // 3 ♦️ + 3 ♣️
        return 70+1;
    }
    return 0;
}


// ---------------------------------------------------
// BROADCAST ENVOYES
// ---------------------------------------------------

function broadcastUpdateGame(){
    const payload = {
        Turn: Turn,
        CurrentCard: CurrentCard,
        PreviousCurrentCard : PreviousCurrentCard,
        Cartes : cartes,
        Special_Power : special_card_power,
        Triche_allowed : Triche_allowed
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

function broadcastPlayers_END() {
    const payload = {
        players: players,
        playerCount: Object.keys(players).length,
        playerCountReady: Nbr_Ready
    };

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: "worldUpdate_END",
                payload: payload
            }));
        }
    });
}

function broadcastUpdateTimer() {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: "TimerUpdate",
                payload: Timer_index
            }));
        }
    });
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

function broadcastPioche(player_num) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: "Pioche",
                payload: player_num
            }));
        }
    });
}

function broadcastCardPlayed(player_num) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: "CardPlayed",
                payload: player_num
            }));
        }
    });
}

function broadcastEndGame(){
    const payload = {
        Winner: WINNER
    };

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: "gameEnded",
                payload: payload
            }));
        }
    });
}

function broadcastUnlock(source){
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: "UNLOCK",
                payload: source
            }));
        }
    });
}

function broadcastCheatingAnimation(source,destination,num,message){
    const payload = {
        Source: source,
        Destination:destination,
        Num: num,
        Message : message
    };
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: "CheatingAnimation",
                payload: payload
            }));
        }
    });
}

function broadcastTimerValue(source, value){
    const payload = {
        Source: source,
        Valeur: value
    };
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: "TIMER_VALUE",
                payload: payload
            }));
        }
    });
}
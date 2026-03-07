const RoomState = Object.freeze({ 
    WAITING_PLAYERS: "WAITING_PLAYERS", 
    GAME_STARTED: "GAME_STARTED", 
    GAME_PAUSED: "GAME_PAUSED", 
    GAME_ENDED: "GAME_ENDED" }); 
    
const WebSocket = require("ws"); // Port du serveur 
const PORT = 6510; // Nbr de Joueurs 

let Nbr_Joueurs = 0; 
let Turn = -1; // Savoir le tour du joueur 
const MAX_PLAYERS = 5; 
let Nbr_Ready = 0; 
let JoueursDeconnectes = 0; 
let roomState = RoomState.WAITING_PLAYERS; // Création du serveur WebSocket 

const wss = new WebSocket.Server({ port: PORT }); 
console.log("🟢 Serveur WebSocket lancé sur le port", PORT); 

// Variables importantes 

let players = {}; 


// Quand un client se connecte 
wss.on("connection", (ws) => {
    if (Nbr_Joueurs === 0){ 
        roomState = RoomState.WAITING_PLAYERS; 
    } 
    console.log("🧑‍💻 Client connecté \n"); 
    Nbr_Joueurs = Nbr_Joueurs +1; 
    console.log("💻 Nbr de Joueurs : " + Nbr_Joueurs + "\n"); 
    if ((Nbr_Joueurs > MAX_PLAYERS) || (roomState === RoomState.GAME_STARTED)) { 
        console.log("⛔ Connexion refusée : serveur plein");
        Nbr_Joueurs = Nbr_Joueurs - 1; 
        console.log("💻 Nbr de Joueurs : " + Nbr_Joueurs + "\n"); 
        ws.send(JSON.stringify({ 
            type: "serverFull", 
            payload: { message: "Le serveur est plein ou la partie a déjà commencée." } 
        })); 
        ws.close(); 
        return; 
    } 
    
    // Quand le serveur reçoit un message 
    ws.on("message", (message) => { 
        //console.log("📩 Message reçu :", message.toString() + "\n"); 
        const data = JSON.parse(message); 
        if (data.type === "joinRoom") { 
            ws.id = Date.now() + Math.random(); 
            players[ws.id] = { 
                id: ws.id, 
                num : Nbr_Joueurs, 
                username: data.payload.Username, 
                teteSkinIndex: data.payload.SkinTeteIndex, 
                corpsSkinIndex: data.payload.SkinCorpsIndex, 
                emotion: data.payload.Emotion 
            }; 
            // ✅ Message privé au joueur 
            ws.send(JSON.stringify({ 
                type: "welcome", 
                payload: { 
                    id: ws.id, 
                    num: Nbr_Joueurs 
                } 
            }));
        } 
        if (data.type === "playerUpdate") {
                let player = players[ws.id]; 
                if (!player) { console.log("⚠️ Player non trouvé"); } 
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
            } else if (Nbr_Ready > 0) { 
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
                wss.clients.forEach(client => { 
                    roomState = RoomState.GAME_STARTED; 
                    if (client.readyState === WebSocket.OPEN) { 
                        client.send(JSON.stringify({ 
                            type: "RoomState", 
                            payload: roomState 
                        })); 
                    } 
                    let cartes_available = []; 
                    for (let i = 1; i <= 52; i++){ 
                        cartes_available.push(i); 
                    } 
                    for (let i = cartes_available.length - 1; i > 0; i--) { // On mélange 
                        const j = Math.floor(Math.random() * (i + 1)); 
                        [cartes_available[i], cartes_available[j]] = [cartes_available[j], cartes_available[i]]; 
                    } 
                    let joueurs = []; 
                    wss.clients.forEach(client => { 
                        joueurs.push({ 
                            socket: client, 
                            cartes: [] 
                        }); 
                    }); 
                    for (let i = 0; i < 7; i++) { // Distribuer les 7 cartes à chaque Joueur 
                        joueurs.forEach(joueur => { 
                            joueur.cartes.push(cartes_available.pop()); 
                        }); 
                    } 
                    joueurs.forEach((joueur, index) => { // Envoyer à chaque joueur les infos 
                        let autresJoueurs = joueurs .filter((_, i) => i !== index) .map(j => j.cartes.length); 
                        joueur.socket.send(JSON.stringify({ 
                            type: "GAME_START", 
                            payload: { 
                                mesCartes: joueur.cartes, 
                                autres: autresJoueurs } 
                            })); 
                        }); 
                    }); 
                } 
            } 
        }); 
        // Quand le client se déconnecte 
        ws.on("close", () => { 
            console.log("❌ Client déconnecté"); 
             
            Nbr_Joueurs = Nbr_Joueurs -1; 
            Nbr_Ready = 0; 
            console.log("💻 Nbr de Joueurs : " + Nbr_Joueurs + "\n"); 
            delete players[ws.id]; 
            ws.emit("updatePlayers", players); 
    }); 
});

function broadcastUpdateGame(){ 
    const payload = { 
        Turn: Turn, 
        CurrentCard: 0 
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
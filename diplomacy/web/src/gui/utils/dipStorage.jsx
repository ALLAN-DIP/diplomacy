// ==============================================================================
// Copyright (C) 2019 - Philip Paquette, Steven Bocco
//
//  This program is free software: you can redistribute it and/or modify it under
//  the terms of the GNU Affero General Public License as published by the Free
//  Software Foundation, either version 3 of the License, or (at your option) any
//  later version.
//
//  This program is distributed in the hope that it will be useful, but WITHOUT
//  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
//  FOR A PARTICULAR PURPOSE.  See the GNU Affero General Public License for more
//  details.
//
//  You should have received a copy of the GNU Affero General Public License along
//  with this program.  If not, see <https://www.gnu.org/licenses/>.
// ==============================================================================
/* DipStorage scheme:
global
- connection
  - username
  - hostname
  - port
  - showServerFields
  (password is intentionally NOT stored — use session tokens only)
users
- (username)
  - games
    - (game_id)
      - phase: string
      - local_orders: {power_name => [orders]}
*/

let STORAGE = null;

export class DipStorage {
    static load() {
        if (!STORAGE) {
            const defaultGlobal = {
                connection: {
                    username: null,
                    hostname: null,
                    port: null,
                    showServerFields: null,
                },
            };
            let storedGlobal = null;
            let storedUsers = null;
            try {
                storedGlobal = window.localStorage.global;
                storedUsers = window.localStorage.users;
            } catch (err) {
                console.warn("DipStorage: localStorage unavailable, using in-memory only", err);
            }
            const parse = (raw, fallback) => {
                if (!raw) return fallback;
                try {
                    return JSON.parse(raw);
                } catch (err) {
                    console.warn("DipStorage: failed to parse stored value, resetting", err);
                    return fallback;
                }
            };
            STORAGE = {
                global: parse(storedGlobal, defaultGlobal),
                users: parse(storedUsers, {}),
            };
            // Scrub any plaintext password previously stored
            delete STORAGE.global.connection.password;
        }
    }

    static save() {
        if (STORAGE) {
            try {
                window.localStorage.global = JSON.stringify(STORAGE.global);
                window.localStorage.users = JSON.stringify(STORAGE.users);
            } catch (err) {
                console.warn("DipStorage: failed to persist to localStorage", err);
            }
        }
    }

    static getConnectionForm() {
        DipStorage.load();
        return Object.assign({}, STORAGE.global.connection);
    }

    static getUserGames(username) {
        DipStorage.load();
        if (STORAGE.users[username]) return Object.keys(STORAGE.users[username].games);
        return null;
    }

    static getUserGameOrders(username, gameID, gamePhase) {
        DipStorage.load();
        if (
            STORAGE.users[username] &&
            STORAGE.users[username].games[gameID] &&
            STORAGE.users[username].games[gameID].phase === gamePhase
        )
            return Object.assign({}, STORAGE.users[username].games[gameID].local_orders);
        return null;
    }

    static setConnectionUsername(username) {
        DipStorage.load();
        STORAGE.global.connection.username = username;
        DipStorage.save();
    }

    static setConnectionHostname(hostname) {
        DipStorage.load();
        STORAGE.global.connection.hostname = hostname;
        DipStorage.save();
    }

    static setConnectionPort(port) {
        DipStorage.load();
        STORAGE.global.connection.port = port;
        DipStorage.save();
    }

    static setConnectionshowServerFields(showServerFields) {
        DipStorage.load();
        STORAGE.global.connection.showServerFields = showServerFields;
        DipStorage.save();
    }

    static addUserGame(username, gameID) {
        DipStorage.load();
        if (!STORAGE.users[username]) STORAGE.users[username] = { games: {} };
        if (!STORAGE.users[username].games[gameID])
            STORAGE.users[username].games[gameID] = { phase: null, local_orders: {} };
        DipStorage.save();
    }

    static addUserGameOrders(username, gameID, gamePhase, powerName, orders) {
        DipStorage.addUserGame(username, gameID);
        if (STORAGE.users[username].games[gameID].phase !== gamePhase)
            STORAGE.users[username].games[gameID] = { phase: null, local_orders: {} };
        STORAGE.users[username].games[gameID].phase = gamePhase;
        STORAGE.users[username].games[gameID].local_orders[powerName] = orders;
        DipStorage.save();
    }

    static removeUserGame(username, gameID) {
        DipStorage.load();
        if (STORAGE.users[username] && STORAGE.users[username].games[gameID]) {
            delete STORAGE.users[username].games[gameID];
            DipStorage.save();
        }
    }

    static clearUserGameOrders(username, gameID, powerName) {
        DipStorage.addUserGame(username, gameID);
        if (powerName) {
            if (STORAGE.users[username].games[gameID].local_orders[powerName])
                delete STORAGE.users[username].games[gameID].local_orders[powerName];
        } else {
            STORAGE.users[username].games[gameID] = { phase: null, local_orders: {} };
        }
        DipStorage.save();
    }

    static setCurrentPath(path) {
        DipStorage.load();
        STORAGE.global.currentPath = path;
        DipStorage.save();
    }

    static getCurrentPath() {
        DipStorage.load();
        return STORAGE.global.currentPath || null;
    }

    static clearCurrentPath() {
        DipStorage.load();
        STORAGE.global.currentPath = null;
        DipStorage.save();
    }
}

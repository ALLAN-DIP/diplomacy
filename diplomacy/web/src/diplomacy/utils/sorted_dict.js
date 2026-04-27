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
import { UTILS } from "./utils";

function defaultComparableKey(key) {
    return key;
}

export class SortedDict {
    constructor(dct, keyFn) {
        this.__keys = [];
        this.__data = []; // [{realKey, value}] — co-located to reduce array mutations per op
        this.__key_fn = keyFn || defaultComparableKey;
        if (dct) for (let key of Object.keys(dct)) this.put(key, dct[key]);
    }

    clear() {
        this.__keys = [];
        this.__data = [];
    }

    put(key, value) {
        const realKey = key;
        key = this.__key_fn(key);
        const lengthBefore = this.__keys.length;
        const position = UTILS.binarySearch.insert(this.__keys, key);
        if (this.__keys.length > lengthBefore) {
            this.__data.splice(position, 0, { realKey, value });
        } else {
            this.__data[position] = { realKey, value };
        }
        return position;
    }

    remove(key) {
        key = this.__key_fn(key);
        const position = UTILS.binarySearch.find(this.__keys, key);
        if (position < 0) return null;
        this.__keys.splice(position, 1);
        return this.__data.splice(position, 1)[0].value;
    }

    contains(key) {
        return UTILS.binarySearch.find(this.__keys, this.__key_fn(key)) >= 0;
    }

    get(key) {
        const position = UTILS.binarySearch.find(this.__keys, this.__key_fn(key));
        if (position < 0) return null;
        return this.__data[position].value;
    }

    indexOf(key) {
        return UTILS.binarySearch.find(this.__keys, this.__key_fn(key));
    }

    keyFromIndex(index) {
        return this.__data[index].realKey;
    }

    valueFromIndex(index) {
        return this.__data[index].value;
    }

    size() {
        return this.__keys.length;
    }

    lastKey() {
        if (!this.__keys.length) throw new Error("Sorted dict is empty.");
        return this.__data[this.__data.length - 1].realKey;
    }

    lastValue() {
        if (!this.__keys.length) throw new Error("Sorted dict is empty.");
        return this.__data[this.__data.length - 1].value;
    }

    keys() {
        return this.__data.map((d) => d.realKey);
    }

    values() {
        return this.__data.map((d) => d.value);
    }

    toDict() {
        const dict = {};
        for (let { realKey, value } of this.__data) {
            dict[realKey] = value;
        }
        return dict;
    }
}

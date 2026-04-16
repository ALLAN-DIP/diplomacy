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
import React from "react";
import { Action } from "./action";
import PropTypes from "prop-types";

export const Tabs = ({ menu, titles, onChange, children, active, highlights = {} }) => {
    if (!menu.length) throw new Error(`No tab menu given.`);
    if (menu.length !== titles.length)
        throw new Error(`Menu length (${menu.length}) != titles length (${titles.length})`);
    if (active && !menu.includes(active))
        throw new Error(
            `Invalid active tab name, got ${active}, expected one of: ${menu.join(", ")}`,
        );
    const activeTab = active || menu[0];
    return (
        <div className={"tabs mb-3"}>
            <nav className={"tabs-bar nav nav-tabs justify-content-center mb-3"}>
                {menu.map((tabName, index) => (
                    <Action
                        isActive={activeTab === tabName}
                        title={titles[index]}
                        onClick={() => onChange(tabName)}
                        highlight={
                            (Object.prototype.hasOwnProperty.call(highlights, tabName) && highlights[tabName]) || null
                        }
                        key={tabName}
                    />
                ))}
            </nav>
            {children}
        </div>
    );
};

Tabs.propTypes = {
    menu: PropTypes.arrayOf(PropTypes.string).isRequired, // tab names
    titles: PropTypes.arrayOf(PropTypes.string).isRequired, // tab titles
    onChange: PropTypes.func.isRequired, // callback(tab name)
    children: PropTypes.array.isRequired,
    active: PropTypes.string, // current active tab name
    highlights: PropTypes.object, // {tab name => highlight message (optional)}
};

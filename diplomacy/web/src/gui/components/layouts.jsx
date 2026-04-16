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
import PropTypes from "prop-types";

const layoutPropTypes = {
    className: PropTypes.string,
    children: PropTypes.oneOfType([PropTypes.array, PropTypes.object]),
};

const createLayoutComponent = (baseClassName) => {
    const Component = ({ className, children }) => (
        <div className={baseClassName + (className ? " " + className : "")}>
            {children}
        </div>
    );
    Component.propTypes = layoutPropTypes;
    Component.displayName = baseClassName.charAt(0).toUpperCase() + baseClassName.slice(1);
    return Component;
};

export const Bar = createLayoutComponent("bar");
export const Row = createLayoutComponent("row");
export const Col = createLayoutComponent("col");

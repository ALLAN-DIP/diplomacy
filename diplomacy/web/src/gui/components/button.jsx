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

export const Button = ({
    title,
    onClick,
    onMouseEnter,
    onMouseLeave,
    color,
    large,
    small,
    pickEvent,
    disabled = false,
    invisible,
}) => {
    const handleClick = (event) => {
        if (onClick) onClick(pickEvent ? event : null);
    };

    return (
        <button
            className={
                `btn btn-${color || "secondary"}` +
                (large ? " btn-block" : "") +
                (small ? " btn-sm" : "") +
                (invisible ? " d-none" : "")
            }
            disabled={disabled}
            onClick={handleClick}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
        >
            <strong>{title}</strong>
        </button>
    );
};

Button.propTypes = {
    title: PropTypes.string.isRequired,
    onClick: PropTypes.func.isRequired,
    onMouseEnter: PropTypes.func,
    onMouseLeave: PropTypes.func,
    color: PropTypes.string,
    large: PropTypes.bool,
    small: PropTypes.bool,
    pickEvent: PropTypes.bool,
    disabled: PropTypes.bool,
    invisible: PropTypes.bool,
};

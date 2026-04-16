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
import React, { useState, useRef } from "react";
import { Button } from "./button";
import PropTypes from "prop-types";

export const DeleteButton = ({ title, confirmTitle, waitingTitle, onClick }) => {
    const [step, setStep] = useState(0);
    const stepRef = useRef(0);

    const handleClick = () => {
        const nextStep = stepRef.current + 1;
        stepRef.current = nextStep;
        setStep(nextStep);
        if (nextStep === 2) onClick();
    };

    let displayTitle = "";
    let color = "";
    if (step === 0) {
        displayTitle = title;
        color = "secondary";
    } else if (step === 1) {
        displayTitle = confirmTitle;
        color = "danger";
    } else if (step === 2) {
        displayTitle = waitingTitle;
        color = "danger";
    }
    return <Button title={displayTitle} color={color} onClick={handleClick} small={true} large={true} />;
};

DeleteButton.propTypes = {
    title: PropTypes.string.isRequired,
    confirmTitle: PropTypes.string.isRequired,
    waitingTitle: PropTypes.string.isRequired,
    onClick: PropTypes.func.isRequired,
};

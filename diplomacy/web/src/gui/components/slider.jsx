import React from "react";
import PropTypes from "prop-types";
import "./slider.css";

export const Slider = ({ country, stance, onChangeStance, dict, clicked }) => {
    return (
        <div className={"slidecontainer"}>
            <input
                type={"range"}
                defaultValue={stance > 0 ? stance : 3}
                min={"1"}
                max={"5"}
                step={"1"}
                onChange={(event) => onChangeStance(country, event.target.value)}
            />

            <p>
                <span id={"stanceValue"} className={clicked ? null : "unclickedSlider"}>
                    {dict[stance > 0 ? stance : 3]}
                </span>
            </p>
        </div>
    );
};

Slider.propTypes = {
    country: PropTypes.string,
    stance: PropTypes.number,
    onChangeStance: PropTypes.func,
    dict: PropTypes.object,
};

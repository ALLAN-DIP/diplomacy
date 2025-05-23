import React from "react";
import PropTypes from "prop-types";
import "./slider.css";

export class Slider extends React.Component {
    constructor(props) {
        super(props);
    }

    country = this.props.country;

    render() {
        return (
            <div className={"slidecontainer"}>
                <input
                    type={"range"}
                    defaultValue={this.props.stance > 0 ? this.props.stance : 3}
                    min={"1"}
                    max={"5"}
                    step={"1"}
                    onChange={(event) => this.props.onChangeStance(this.country, event.target.value)}
                />

                <p>
                    <span id={"stanceValue"} className={this.props.clicked ? null : "unclickedSlider"}>
                        {this.props.dict[this.props.stance > 0 ? this.props.stance : 3]}
                    </span>
                </p>
            </div>
        );
    }
}

Slider.propTypes = {
    country: PropTypes.string,
    stance: PropTypes.number,
    onChangeStance: PropTypes.func,
    dict: PropTypes.object,
};

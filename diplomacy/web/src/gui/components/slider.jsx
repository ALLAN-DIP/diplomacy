import React from "react";
import PropTypes from "prop-types";
import "./slider.css";

export class Slider extends React.Component {
    constructor(props) {
        super(props);
        if (props.stance > 0) {
            this.state = { value: props.stance };
        } else {
            this.state = this.getInitialValue();
        }
        this.clickSlider = this.clickSlider.bind(this);
    }

    clickSlider = (event) => {
        this.setState({ value: event.target.value });
        this.props.onChangeStance(this.country, event.target.value);
    };

    getInitialValue() {
        return { value: 3 };
    }

    country = this.props.country;

    render() {
        return (
            <div className={"slidecontainer"}>
                <input
                    type={"range"}
                    defaultValue={this.state.value}
                    min={"1"}
                    max={"5"}
                    step={"1"}
                    onClick={this.clickSlider}
                />

                <p>
                    <span
                        id={"stanceValue"}
                        className={
                            this.props.clicked ? null : "unclickedSlider"
                        }
                    >
                        {this.props.dict[this.state.value]}
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

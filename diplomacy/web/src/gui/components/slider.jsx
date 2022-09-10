import React from "react";
import PropTypes from "prop-types";

export class Slider extends React.Component {
    constructor(props) {
        super(props);
        this.state = this.getInitialValue();
        this.handleChange = this.handleChange.bind(this);
    }

    getInitialValue() {
        return {value: 0};
    }

    STANCE = {0: 'Stance not given', 1: 'Very hostile', 2: 'Hostile', 3: 'Neutral', 4: 'Friendly', 5: 'Very friendly'};
    country = this.props.country;

    handleChange = (event) => {
        this.setState({value: event.target.value});
        this.props.onChangeStance(this.country, event.target.value);
    }

    render() {
        return (
            <div className={"slidecontainer"}>
                <input type={"range"} value={this.state.value} min={"0"} max={"5"} step={"1"}
                       onChange={this.handleChange}/>

                <p><span id={"stanceValue"}>{this.STANCE[this.state.value]}</span></p>
            </div>

        );
    }
}

/*Slider.propTypes = {

};

Slider.defaultProps = {

};*/

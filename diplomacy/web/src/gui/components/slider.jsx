import React from "react";
import PropTypes from "prop-types";

export class Slider extends React.Component {
    constructor(props) {
        super(props);
        if (props.stance > 0) {
            this.state = {value: props.stance}
        } else{
            this.state = this.getInitialValue();
        }
        this.handleChange = this.handleChange.bind(this);
    }

    getInitialValue() {
        return {value: 1};
    }

    country = this.props.country;

    handleChange = (event) => {
        this.setState({value: event.target.value});
        this.props.onChangeStance(this.country, event.target.value);
    }

    render() {
        return (
            <div className={"slidecontainer"}>
                <input type={"range"} value={this.state.value} min={"0"} max={"2"} step={"1"}
                       onChange={this.handleChange}/>

                <p><span id={"stanceValue"}>{this.props.dict[this.state.value]}</span></p>
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

/*
Slider.defaultProps = {

};*/

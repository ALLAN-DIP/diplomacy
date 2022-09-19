import React from 'react';
import { PropTypes } from 'prop-types';


export class AnnotationForm extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            truth: false,
            lie: false,
        };

        this.handleTruth = this.handleTruth.bind(this);
        this.handleLie = this.handleLie.bind(this);
    }

    handleTruth() {
        this.setState ( () => ({
            truth: true,
            lie: false,
        }));
    }

    handleLie() {
        this.setState ( () => ({
            truth: false,
            lie: true,
        }));
    }

    

    render(){
        const message = this.props.message;
        return (
             <div>
                <label className="checkbox-container">True
                    <input type="radio" name={message.time_sent} onClick={this.handleTruth}/>
                    <span className="checkmark"></span>
                </label>

                <label className="checkbox-container">False
                    <input type="radio" name={message.time_sent} onClick={this.handleLie}/>
                    <span className="checkmark"></span>
                </label>
            </div>
        );
    }

}

AnnotationForm.propTypes = {
    message: PropTypes.object,
};
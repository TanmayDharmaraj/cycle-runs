import moment from 'moment';
import Rx from 'rxjs/Rx';
import fp from 'lodash/fp';
import { run } from '@cycle/rxjs-run';
import {button, input, h1, a, ul, li, div, p, span, makeDOMDriver} from '@cycle/dom';
import { makeHTTPDriver } from '@cycle/http'

function intent(domSource, httpSource) {
    const api_key = "DEMO_KEY";
    let getDataFromNasa = function() {
        const action$ = domSource.select('.load-more').events('click').mapTo(+7)
        const request$ = action$.startWith({
            start: moment().format("YYYY-MM-DD"),
            end: moment().add(7, 'days').format("YYYY-MM-DD")
        }).scan((state, n) => {
            const start = state.start ? moment(state.start).add(n, 'days') : moment();
            const end = state.end ? moment(state.end).add(n, 'days') : moment().add(n, 'days')
            const formatted_start = moment(start).format("YYYY-MM-DD");
            const formatted_end = moment(end).format("YYYY-MM-DD");
            return {
                start: formatted_start,
                end: formatted_end
            }
        }).map(i => ({
                url: "https://api.nasa.gov/neo/rest/v1/feed?start_date=" + i.start + "&end_date=" + i.end + "&api_key=" + api_key,
                method: "GET"
        }));

        const response$$ = httpSource.filter(x$ => x$.url.indexOf("https://api.nasa.gov/neo/rest/v1/feed") != -1).select(response$$);
        const response$ = response$$.switch(); //flatten the stream
        const response = response$.map(response => {
            return response.body
        }).map(nasa =>
            fp.toPairs(nasa.near_earth_objects)
            .map(obj => ({
                    date: obj[0],
                    objects: obj[1]
            }))
        )
        return {
            response,
            request$
        }
    }();

    let getItemInfo = domSource.select('.list').events('click')
        .map(evt => evt.target.innerHTML);

    return { getDataFromNasa, getItemInfo }
}

const Operations = {
    AddItem: newItem => state => {
        state.near_earth_objects = state.near_earth_objects.concat(newItem);
        return state;
    },
    LogClick: item => state => {
        state.selected = fp.flatten(state.near_earth_objects.map(neo => fp.filter(obj => obj.name === item)(neo.objects)));
        return state;
    }
}

function model(intents) {
    let getData = intents.getDataFromNasa.response.map(item => Operations.AddItem(item));

    let getListItemClick = intents.getItemInfo.map(item => Operations.LogClick(item))

    let allOperations$ = Rx.Observable.merge(getData, getListItemClick);

    let state$ = allOperations$.scan((state, operation) => operation(state), {
        near_earth_objects: [],
        selected: []
    })
    return state$;
}

function view(state$) {
    return state$.startWith({
        near_earth_objects: [],
        selected: []
    }).map(item =>
        div('.container', [
            div('.col-xs-6', {style: {height: "90%", "overflow-y": 'scroll'}}, item.near_earth_objects.map(i =>
                div([
                    h1(i.date),
                    ul(i.objects.map(obj => li('.list', [
                      span(obj.name),
                      obj.is_potentially_hazardous_asteroid === true ? span('.label.label-danger', "danger") : null
                    ])))
                ])
            )),
            div('.well.col-xs-6', item.selected.map(i =>
                div([
                    div('.col-xs-12.text-center', [
                        a('.lead', {
                            props: {
                                href: i.nasa_jpl_url,
                                target: "_blank"
                            }
                        }, i.name),
                    ]),
                    div('.col-xs-12.lead', [
                        span('.col-xs-8', "absolute_magnitude_h"),
                        span('.col-xs-4', i.absolute_magnitude_h)
                    ]),
                    div('.col-xs-12.lead', [
                        p('.col-xs-8', "estimated_diameter (Kms.)"),
                        p('.col-xs-4', `${i.estimated_diameter.kilometers.estimated_diameter_max.toFixed(2)} (Max.) ${i.estimated_diameter.kilometers.estimated_diameter_min.toFixed(2)} (Min.)`)
                    ]),
                    div('.col-xs-12.lead', [
                        p('.col-xs-12', i.close_approach_data.map(c=>p(
                          `Approaching ${c.orbiting_body} on ${c.close_approach_date} with a relative velocity of ${c.relative_velocity.kilometers_per_hour}. It will miss ${c.orbiting_body} by ${c.miss_distance.kilometers} kms.`
                        )))
                    ])
                ])
            )),
            div('.col-xs-12.text-center',{style:{"padding-top":"50px"}}, [
                button(".btn.btn-info.load-more", "Load More")
            ])
        ])
    )
}

function main(sources) {
    const intents = intent(sources.DOM, sources.HTTP);
    const state$ = model(intents);
    const vdom$ = view(state$);
    return {
        DOM: vdom$,
        HTTP: intents.getDataFromNasa.request$
    };
};

const drivers = {
    DOM: makeDOMDriver('#app'),
    HTTP: makeHTTPDriver()
};
run(main, drivers);

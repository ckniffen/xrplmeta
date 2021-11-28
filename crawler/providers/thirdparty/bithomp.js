import { loopOperation } from '../base.js'
import Rest from '../../lib/rest.js'
import { log } from '../../../common/lib/log.js'
import { wait } from '../../../common/lib/time.js'


export default ({repo, config}) => {
	let api = new Rest({
		base: 'https://bithomp.com/api/v2', 
		headers: {'x-bithomp-token': config.apiKey}
	})

	loopTimeTask(
		{
			task: 'bithomp.assets',
			interval: config.refreshInterval
		},
		async t => {
			log.info(`fetching services list...`)

			let result = await api.get('services')
			let services = result.services
			let metas = []

			log.info(`got`, services.length, `services`)

			for(let service of services){
				let meta = {
					name: service.name,
					domain: service.domain
				}

				if(service.socialAccounts){
					for(let [social, locator] of Object.entries(service.socialAccounts)){
						meta[`socials.${social}`] = locator
					}
				}

				for(let { address } of service.addresses){
					metas.push({
						issuer: address,
						meta,
						source: 'bithomp.com'
					})
				}
			}

			log.info(`writing`, metas.length, `metas to db...`)

			await repo.metas.set(metas)

			log.info(`asset scan complete`)
		}
	)
}


export default class extends RestProvider{
	constructor({repo, nodes, config}){
		super({
			base: 'https://bithomp.com/api/v2', 
			headers: {'x-bithomp-token': config.bithomp.apiKey}}
		)

		this.repo = repo
		this.nodes = nodes
		this.config = config.bithomp
	}

	run(){
		this.loopOperation(
			'bithomp.assets', 
			null,
			this.config.refreshInterval, 
			this.refresh.bind(this)
		)
	}

	async refresh(){
		log.info(`fetching services list...`)

		let result = await this.api.get('services')
		let services = result.services
		let metas = []

		log.info(`got`, services.length, `services`)

		for(let service of services){
			let meta = {
				name: service.name,
				domain: service.domain
			}


			if(service.socialAccounts){
				for(let [social, locator] of Object.entries(service.socialAccounts)){
					meta[`socials.${social}`] = locator
				}
			}

			for(let { address } of service.addresses){
				metas.push({
					meta,
					type: 'issuer',
					subject: address,
					source: 'bithomp.com'
				})
			}
		}

		log.info(`writing`, metas.length, `metas to db...`)

		await this.repo.metas.set(metas)

		log.info(`asset scan complete`)
	}
}
export function init(){
	this.exec(
		`CREATE TABLE IF NOT EXISTS "Trustlines" (
			"id"			INTEGER NOT NULL UNIQUE,
			"currency"		TEXT NOT NULL,
			"issuer"		INTEGER NOT NULL,
			"inception"		INTEGER,
			PRIMARY KEY("id" AUTOINCREMENT)
		);
		
		CREATE UNIQUE INDEX IF NOT EXISTS 
		"trustlineCurrencyIssuer" ON "Trustlines" 
		("currency","issuer");`
	)
}

export function require({currency, issuer}){
	let issuerId = this.accounts.require(issuer)

	let { id } = this.insert(
		'Trustlines',
		{
			currency,
			issuer: issuerId
		},
		{
			duplicate: {
				keys: ['currency', 'issuer'],
				ignore: true
			}
		}
	)

	return id
}

export async function get(){
	return this.db.all(
		`SELECT 
			id,
			currency, 
			(SELECT address FROM Issuers WHERE Issuers.id = issuer) as issuer
		FROM Trustlines`, 
	)
}

export async function has({currency, issuer}){
	if(currency === 'XRP')
		return true

	return !!await getOne.call(this, {currency, issuer})
}

export async function getOne(by, createIfNonExistent){
	if(by.currency && by.issuer){
		let issuer = typeof by.issuer === 'string'
			? await this.issuers.getOne({address: by.issuer}, createIfNonExistent)
			: await this.issuers.getOne({id: by.issuer}, createIfNonExistent)

		if(!issuer)
			return null

		let trustline = this.db.get(
			`SELECT * 
			FROM Trustlines 
			WHERE currency=? AND issuer=?`, 
			by.currency, issuer.id
		)

		if(!trustline && createIfNonExistent)
			trustline = await this.db.insert(
				'Trustlines',
				{
					currency: by.currency, 
					issuer: issuer.id
				}
			)

		return trustline
	}
}

export async function idFromCurrency(currency){
	return currency.currency !== 'XRP' 
		? (await this.trustlines.getOne.call(this, currency, true)).id
		: 0
}
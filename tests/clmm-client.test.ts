import { ClmmClient } from '../src/ClmmClient'

describe('ClmmClient', () => {
    const client = new ClmmClient({ rpc: 'https://api.mainnet-beta.solana.com' })

    it('should fetch CLMM pool info', async () => {
        console.log('test')
        const poolInfo = await client.getClmmPoolInfo('8sLbNZoA1cfnvMJLPfp98ZLAnFSYCFApfJKMbiXNLwxj')
        expect(poolInfo).not.toBeNull()
    })
})

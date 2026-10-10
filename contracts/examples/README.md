# Synthetic contract examples

Every file is **synthetic**: demo names, fictional conversations, a constant
placeholder embedding, and an all-zero checksum. None of it is a real face
embedding, model checksum, transcript, or provider result.

File names are `<ContractModel>.<variant>.json`. `backend/tests/test_contracts.py`
validates each file against that model in `backend/app/contracts.py`; the
frontend fixtures import these same files. Update them together with the schema.

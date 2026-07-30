# Eskiz-1 Project Guidelines

## Tech Stack
- Python 3.10+
- FastAPI (Backend API)
- PyTorch / TensorFlow (LSTM Model for Stock Prediction)
- Pandas / NumPy (Data Processing)

## Code Style & Standards
- Follow PEP8 strictly.
- Use type hinting for all function parameters and return types.
- Keep business logic in services, endpoints clean in routers.
- Write docstrings for complex mathematical/LSTM operations.

## Common Commands
- Run Server: `uvicorn main:app --reload`
- Run Tests: `pytest`
- Install Dependencies: `pip install -r requirements.txt`

## Communication Style
- Be concise. Explain architectural decisions briefly before giving code.
- Always check existing code before suggesting new implementations.
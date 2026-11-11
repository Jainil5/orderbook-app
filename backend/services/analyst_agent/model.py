
import os
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI

load_dotenv()

# Provider selection is controlled through .env.
# OPENAI:
#   LLM_API_KEY=your_openai_api_key
#   LLM_BASE_URL=https://api.openai.com/v1
#   LLM_MODEL=your_openai_model
#
# NVIDIA NIM:
#   NVIDIA_API_KEY=your_nvidia_nim_api_key (or set LLM_API_KEY to the same value)
#   LLM_BASE_URL=https://integrate.api.nvidia.com/v1
#   LLM_MODEL=the_nvidia_model_id_from_nvidia_build
#
# OLLAMA (OpenAI-compatible endpoint):
#   LLM_API_KEY=ollama
#   LLM_BASE_URL=http://localhost:11434/v1
#   LLM_MODEL=gpt-oss:20b-cloud
#
# Use only one provider configuration at a time.

llm = ChatOpenAI(
    model=os.getenv("LLM_MODEL", "gpt-4o-mini"),
    api_key=(os.getenv("LLM_API_KEY") or os.getenv("NVIDIA_API_KEY") or os.getenv("OPENAI_API_KEY")),
    base_url=os.getenv("LLM_BASE_URL", "https://api.openai.com/v1"),
    temperature=0.2,
)

# The same shared model is used by the query planner and AI Sales Analyst.
AI_SALES_ANALYST_NAME = "AI Sales Analyst"


# OPTIONAL: Native Ollama integration instead of the OpenAI-compatible endpoint.
# Uncomment this block and comment out the ChatOpenAI block above.
#
# from langchain_ollama import ChatOllama
#
# llm = ChatOllama(
#     model="gpt-oss:20b-cloud",
#     temperature=0.2,
# )


# OPTIONAL: Native NVIDIA LangChain integration, if you prefer it over the
# OpenAI-compatible NVIDIA NIM endpoint above.
# Install the integration package supported by your environment:
#   pip install langchain-nvidia-ai-endpoints
#
# from langchain_nvidia_ai_endpoints import ChatNVIDIA
#
# llm = ChatNVIDIA(
#     model="your-nvidia-model-id",
#     nvidia_api_key=os.getenv("NVIDIA_API_KEY"),
#     temperature=0.2,
# )

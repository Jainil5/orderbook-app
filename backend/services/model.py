import os
from langchain_nvidia_ai_endpoints import ChatNVIDIA
from dotenv import load_dotenv

load_dotenv()

AI_SALES_ANALYST_NAME = "AI Sales Analyst"



# from langchain_openai import ChatOpenAI
# llm =  ChatOpenAI(
#             model=os.getenv("LLM_MODEL", "gpt-4o-mini"),
#             api_key=os.getenv("LLM_API_KEY") or os.getenv("OPENAI_API_KEY"),
#             base_url=os.getenv("LLM_BASE_URL", "https://api.openai.com/v1"),
#             temperature=0.2,
#             max_tokens=8192,
#             timeout=300,
#         )


# from langchain_ollama import ChatOllama
# llm =  ChatOllama(
#         model=os.getenv("LLM_MODEL") or os.getenv("OLLAMA_MODEL", "gpt-oss:20b-cloud"),
#         base_url=os.getenv("OLLAMA_URL", "http://localhost:11434"),
#         temperature=0.2,
#     )




# # The same shared model is used by the query planner and AI Sales Analyst.

llm = ChatNVIDIA(
        model="nvidia/nemotron-3.5-lightning-30b-a3b",
        nvidia_api_key=os.getenv("NVIDIA_API_KEY") or os.getenv("LLM_API_KEY"),
            temperature=0.2,
            # Reasoning models spend part of the budget thinking; a small cap
            # leaves no room for the answer and content comes back empty.
            max_tokens=8192,
            timeout=300,
)

# Read off the client so the label the API returns can never drift from the
# model that actually answers.
MODEL = llm.model


# print(llm.invoke("What is the capital of France?"))

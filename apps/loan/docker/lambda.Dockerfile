FROM public.ecr.aws/lambda/python:3.13
COPY --from=ghcr.io/astral-sh/uv:0.12.19 /uv /usr/local/bin/uv
COPY pyproject.toml uv.lock ./
RUN uv export --frozen --no-dev --no-emit-project --format requirements-txt > /tmp/requirements.txt \
    && pip install --no-cache-dir -r /tmp/requirements.txt
COPY *.py ./
ENV TEMPORAL_ENV=cloud
CMD ["lambda_function.lambda_handler"]
